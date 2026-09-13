"""Read-only server resource sampling; no database or detector dependencies."""
import subprocess
import threading
import time

_lock = threading.Lock()
_cached = None
_sampled_at = 0


def sample_resources():
    global _cached, _sampled_at
    with _lock:
        if _cached is not None and time.monotonic() - _sampled_at < 1:
            return _cached
        result = {'timestamp_ms': time.time() * 1000, 'cpu_percent': None,
                  'ram_gb': None, 'process_ram_gb': None, 'gpus': [], 'errors': []}
        try:
            import psutil
            result.update(cpu_percent=psutil.cpu_percent(interval=0.1),
                          ram_gb=psutil.virtual_memory().used / 1024**3,
                          process_ram_gb=psutil.Process().memory_info().rss / 1024**3)
        except Exception as exc:
            result['errors'].append('CPU/RAM: ' + str(exc))
        try:
            proc = subprocess.run(
                ['nvidia-smi', '--query-gpu=index,name,utilization.gpu,memory.used,memory.total',
                 '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=2,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if proc.returncode:
                raise RuntimeError('nvidia-smi unavailable')
            for line in proc.stdout.splitlines():
                index, name, utilization, used, total = [v.strip() for v in line.split(',')]
                result['gpus'].append(dict(index=int(index), name=name, percent=float(utilization),
                                           vram_gb=float(used)/1024, total_gb=float(total)/1024))
        except Exception as exc:
            result['errors'].append('GPU: ' + str(exc))
        _cached, _sampled_at = result, time.monotonic()
        return result
