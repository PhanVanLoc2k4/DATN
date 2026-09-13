import sys
import os
import time
from datetime import datetime
import math
from threading import Lock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from db_helper import save_violation_to_db

class EventProcessingEngine:
    def __init__(self):
        # Lưu trữ trạng thái cooldown của sự kiện để tránh gửi liên tục
        # Cấu trúc: { f"{cam_id}_{tid}_{event_type}": last_triggered_time }
        self.event_cooldowns = {}
        self.scene_events = {}
        self.scene_lock = Lock()
        self.EVENT_QUIET_SECONDS = 30.0
        self.SAVE_RETRY_SECONDS = 30.0
        
        # Lưu trữ trạng thái nhận diện hành vi (đánh nhau) của từng đối tượng
        # Cấu trúc: { cam_id: { tid: { "fight_counter": int, "fight_start_time": float, "last_seen": float } } }
        self.fight_states = {}
        
        # Cấu hình ngưỡng thời gian và số frame lọc nhiễu
        self.FIGHT_CONFIRM_FRAMES = 3  # Số frame liên tiếp để xác nhận có xô xát
        self.FIGHT_DURATION_THRESHOLD = 3.0  # Thời gian duy trì hành vi (giây) để kích hoạt cảnh báo đỏ
        self.ALERT_COOLDOWN = 30.0  # Thời gian cooldown (giây) giữa các lần gửi cảnh báo của cùng một đối tượng
        
    def filter_noise_boxes(self, processed_objects, iou_threshold=0.35):
        """
        Lọc nhiễu: Loại bỏ các hộp nhận diện (bounding box) trùng lặp hoặc chồng đè lên nhau.
        Ưu tiên các hộp có cảnh báo hoạt động (is_alert) hoặc có ID định danh rõ ràng.
        """
        if not processed_objects:
            return []

        # Sắp xếp ưu tiên: Box có is_alert -> Box có tên nhận diện -> Box có track_id -> Box diện tích lớn hơn
        def get_score(obj):
            box = obj["bbox"]
            area = (box[2] - box[0]) * (box[3] - box[1])
            is_alert = 1 if obj.get("is_alert") else 0
            has_track = 1 if obj.get("track_id") is not None else 0
            name = obj.get("name", "")
            has_name = 1 if (name and not name.startswith("👤 NGƯỜI") and not name.startswith("Đối tượng")) else 0
            return (is_alert, has_name, has_track, area)

        sorted_objs = sorted(processed_objects, key=get_score, reverse=True)
        deduped = []

        for obj in sorted_objs:
            box = obj["bbox"]
            keep = True
            for other in deduped:
                other_box = other["bbox"]
                
                xA = max(box[0], other_box[0])
                yA = max(box[1], other_box[1])
                xB = min(box[2], other_box[2])
                yB = min(box[3], other_box[3])
                interArea = max(0, xB - xA) * max(0, yB - yA)
                if interArea <= 0:
                    continue
                    
                box1Area = (box[2] - box[0]) * (box[3] - box[1])
                box2Area = (other_box[2] - other_box[0]) * (other_box[3] - other_box[1])
                minArea = min(box1Area, box2Area)
                unionArea = float(box1Area + box2Area - interArea)
                
                iou = interArea / unionArea if unionArea > 0 else 0
                iom = interArea / float(minArea) if minArea > 0 else 0
                
                # Nếu IoU > 0.35 HOẶC 1 box nằm gọn trong box kia (> 55% diện tích box nhỏ), coi như trùng lặp
                if iou > iou_threshold or iom > 0.55:
                    keep = False
                    break

            if keep:
                deduped.append(obj)

        return deduped

    def process_behavior_event(self, cam_id, tid, is_detected_raw, current_time=None):
        """
        Áp dụng ngưỡng lọc nhiễu khung hình (FIGHT_CONFIRM_FRAMES) và ngưỡng thời gian (3 giây)
        để xác định xem hành vi xô xát đã đủ điều kiện cảnh báo hay chưa.
        Returns:
            is_fighting (bool): Đối tượng đang trong trạng thái đánh nhau (đã qua lọc frame).
            is_alert (bool): Đã vượt ngưỡng thời gian 3s để kích hoạt báo động.
        """
        if current_time is None:
            current_time = time.time()
            
        if cam_id not in self.fight_states:
            self.fight_states[cam_id] = {}
        
        cam_cache = self.fight_states[cam_id]
        if tid not in cam_cache:
            cam_cache[tid] = {
                "fight_counter": 0,
                "fight_start_time": None,
                "last_seen": current_time
            }
            
        state = cam_cache[tid]
        state["last_seen"] = current_time
        
        # 1. Lọc nhiễu frame: Tăng/giảm bộ đếm dựa trên nhận diện tức thời
        if is_detected_raw:
            state["fight_counter"] = min(state["fight_counter"] + 1, 30)
        else:
            state["fight_counter"] = max(0, state["fight_counter"] - 1)
            
        is_fighting = state["fight_counter"] >= self.FIGHT_CONFIRM_FRAMES
        
        # 2. Áp dụng ngưỡng thời gian duy trì hành vi (3 giây)
        is_alert = False
        if is_fighting:
            if state["fight_start_time"] is None:
                state["fight_start_time"] = current_time
            
            duration = current_time - state["fight_start_time"]
            if duration >= self.FIGHT_DURATION_THRESHOLD:
                is_alert = True
        else:
            state["fight_start_time"] = None
            
        # Dọn dẹp các ID cũ không còn xuất hiện trong hơn 20 giây
        to_remove = [t for t, info in cam_cache.items() if current_time - info["last_seen"] > 20.0]
        for t in to_remove:
            del cam_cache[t]
            
        return is_fighting, is_alert

    def assess_danger_level(self, cam_id, event_type, participant_count=0, has_weapon=False, location="Hành lang", weapon_name=""):
        """
        Xác định mức độ nguy hiểm dựa trên các yếu tố kết hợp:
        - Số lượng người tham gia.
        - Có vũ khí đi kèm hay không (Luật kết hợp sự kiện).
        - Vị trí camera xảy ra sự kiện.
        - Khung giờ phát hiện sự kiện (Ban đêm/Trong giờ học).
        Returns:
            str: Mức độ nguy hiểm ('MỨC THẤP', 'MỨC TRUNG BÌNH', 'MỨC CAO', 'NGUY HIỂM KHẨN CẤP')
        """
        now = datetime.now()
        hour = now.hour
        is_night = (hour >= 21) or (hour <= 5)
        
        loc_lower = location.lower() if location else ""
        
        # --- LUẬT KẾT HỢP SỰ KIỆN (Vũ khí + Đánh nhau) ---
        if event_type == "fight" and has_weapon:
            w_tag = f" - {weapon_name}" if weapon_name and weapon_name != "Vũ khí" else ""
            return f"GÂY GỔ / ĐÁNH NHAU CÓ VŨ KHÍ{w_tag} (NGUY HIỂM KHẨN CẤP)"
            
        # --- PHÂN CẤP SỰ KIỆN ĐÁNH NHAU ---
        if event_type == "fight":
            if participant_count >= 8:
                return "GÂY GỔ / ĐÁNH NHAU (MỨC CAO)"
            elif is_night or "cầu thang" in loc_lower or "cau thang" in loc_lower:
                return "GÂY GỔ / ĐÁNH NHAU (MỨC CAO)"
            else:
                return "GÂY GỔ / ĐÁNH NHAU (MỨC TRUNG BÌNH)"
                
        # --- PHÂN CẤP SỰ KIỆN ĐÁM ĐÔNG ---
        if event_type == "crowd":
            if is_night:
                return "TỤ TẬP ĐÔNG NGƯỜI (MỨC CAO)"
            elif "hành lang" in loc_lower or "cầu thang" in loc_lower or "cau thang" in loc_lower:
                # Tụ tập ở lối thoát hiểm/hành lang trong giờ học dễ xảy ra tai nạn
                return "TỤ TẬP ĐÔNG NGƯỜI (MỨC TRUNG BÌNH)"
            else:
                return "TỤ TẬP ĐÔNG NGƯỜI (MỨC THẤP)"
                
        # --- PHÂN CẤP SỰ KIỆN VŨ KHÍ ---
        if event_type == "weapon":
            w_tag = f" - {weapon_name}" if weapon_name and weapon_name != "Vũ khí" else ""
            if is_night or "cầu thang" in loc_lower or "cau thang" in loc_lower:
                return f"PHÁT HIỆN VŨ KHÍ{w_tag} (NGUY HIỂM KHẨN CẤP)"
            return f"PHÁT HIỆN VŨ KHÍ{w_tag} (MỨC CAO)"

        # --- PHÂN CẤP SỰ KIỆN NHẬN DIỆN KHUÔN MẶT / NGƯỜI LẠ ---
        if event_type == "face":
            if is_night:
                return "PHÁT HIỆN NGƯỜI LẠ (MỨC TRUNG BÌNH)"
            return "PHÁT HIỆN NGƯỜI LẠ (MỨC THẤP)"
                
        return "CẢNH BÁO"

    def check_and_update_cooldown(self, cam_id, tid, event_type, current_time=None):
        """
        Kiểm tra xem sự kiện của đối tượng này có bị lặp lại trong 30 giây gần nhất hay không.
        Returns:
            bool: True nếu sự kiện được phép gửi (không trùng lặp), False nếu đang trong cooldown.
        """
        if current_time is None:
            current_time = time.time()
            
        cache_key = f"{cam_id}_{tid}_{event_type}"
        
        if cache_key in self.event_cooldowns:
            elapsed = current_time - self.event_cooldowns[cache_key]
            if elapsed < self.ALERT_COOLDOWN:
                # Đang trong thời gian cooldown -> chặn gửi trùng lặp
                return False
                
        # Cập nhật thời điểm gửi cảnh báo mới nhất
        self.event_cooldowns[cache_key] = current_time
        
        # Dọn dẹp cache cooldown quá hạn (sau 10 phút) để tránh rò rỉ bộ nhớ
        expired_keys = [k for k, t in self.event_cooldowns.items() if current_time - t > 600.0]
        for k in expired_keys:
            del self.event_cooldowns[k]
            
        return True

    def _save_scene_alert(self, cam_id, event_type, v_type, frame, objs, identities):
        """Một bản ghi cho một đợt cảnh báo, kể cả khi tracker đổi ID."""
        key = (str(cam_id), event_type)
        now = time.monotonic()
        with self.scene_lock:
            expired = [k for k, s in self.scene_events.items()
                       if not s['pending'] and now - s['last_seen'] > 600]
            for k in expired:
                del self.scene_events[k]
            state = self.scene_events.get(key)
            if state is None or (not state['pending'] and
                                 now - state['last_seen'] >= self.EVENT_QUIET_SECONDS):
                state = {'last_seen': now, 'saved': False, 'pending': False,
                         'last_attempt': float('-inf')}
                self.scene_events[key] = state
            state['last_seen'] = now
            if (state['saved'] or state['pending'] or
                    now - state['last_attempt'] < self.SAVE_RETRY_SECONDS):
                return False
            state['pending'] = True
            state['last_attempt'] = now

        saved = False
        try:
            saved = bool(save_violation_to_db(cam_id, v_type, frame, objs, identities))
            if saved:
                print(f"🚨 [EventEngine] Đã lưu cảnh báo '{v_type}' cho camera {cam_id}.")
            return saved
        finally:
            with self.scene_lock:
                state['saved'] = saved
                state['pending'] = False

    def process_and_log_alert(self, cam_id, alert_tids, objs, identities, frame, location="Hành lang", api_type=None):
        """
        Gộp nhiều cảnh báo liên tiếp thành một sự kiện duy nhất, kiểm tra cooldown
        và thực hiện ghi log vào Cơ sở dữ liệu.
        """
        # Nếu không có track ID cụ thể, dùng ID mặc định 0 để quản lý cooldown
        tids = alert_tids if alert_tids else [0]
        
        # Xác định loại sự kiện chính
        is_crowd = any(tid == -1 for tid in tids)
        
        from detector import camera_configs
        api_type = api_type or camera_configs.get(cam_id, 'face')
        if api_type == 'weapon':
            # Chỉ ghi log sự kiện nếu trong danh sách ô nhận diện thực sự có ô đánh dấu cảnh báo (is_alert=True)
            has_active_weapon_alert = any(obj.get("is_alert", False) for obj in objs)
            if not has_active_weapon_alert:
                return False
            event_type = "weapon"
        elif api_type == 'crowd' or is_crowd:
            event_type = "crowd"
        elif api_type == 'face':
            objs = [obj for obj in objs if obj.get('is_alert') or obj.get('has_alert')]
            if not objs:
                return False
            tids = [obj['track_id'] for obj in objs if obj.get('track_id') is not None]
            identities = "Đối tượng người lạ"
            event_type = "face"
        else:
            event_type = "fight"
        
        # Trích xuất loại vũ khí cụ thể (Dao, Gậy, Súng) từ objs và identities
        weapon_types = []
        for w_name in ["Súng", "Dao", "Gậy"]:
            for obj in objs:
                obj_text = f"{obj.get('name', '')} {obj.get('vtype', '')} {obj.get('status', '')}"
                if w_name.lower() in obj_text.lower() and w_name not in weapon_types:
                    weapon_types.append(w_name)
            if identities and w_name.lower() in str(identities).lower() and w_name not in weapon_types:
                weapon_types.append(w_name)
        weapon_str = ", ".join(weapon_types) if weapon_types else ""

        # Kiểm tra vũ khí giả định hoặc các nhãn đi kèm trong objs
        has_weapon = any("vũ khí" in str(obj.get("vtype", "")).lower() or "weapon" in str(obj.get("vtype", "")).lower() or "dao" in str(obj.get("name", "")).lower() or "gậy" in str(obj.get("name", "")).lower() or "súng" in str(obj.get("name", "")).lower() for obj in objs) or bool(weapon_types)
        
        # Tính toán mức độ nguy hiểm
        participant_count = sum(1 for obj in objs if "đang đánh nhau" in str(obj.get("name", "")).lower())
        v_type = self.assess_danger_level(
            cam_id=cam_id,
            event_type=event_type,
            participant_count=participant_count,
            has_weapon=has_weapon,
            location=location,
            weapon_name=weapon_str
        )
        
        # Sự kiện tại hiện trường không phụ thuộc ID của tracker.
        if event_type in ('weapon', 'fight', 'crowd'):
            return self._save_scene_alert(cam_id, event_type, v_type, frame, objs, identities)

        # Nhận diện khuôn mặt vẫn quản lý cooldown theo từng người.
        now = time.time()
        should_save = False
        
        for tid in tids:
            if self.check_and_update_cooldown(cam_id, tid, event_type, now):
                should_save = True
                
        if should_save:
            # Lưu sự kiện vào database thông qua db_helper
            save_violation_to_db(cam_id, v_type, frame, objs, identities)
            print(f"🚨 [EventEngine] Đã lưu cảnh báo '{v_type}' thành công cho camera {cam_id}.")
            return True
            
        return False

# Khởi tạo instance toàn cục cho Event Processing Engine
event_engine = EventProcessingEngine()
