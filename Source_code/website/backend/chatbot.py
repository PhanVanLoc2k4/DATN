# -*- coding: utf-8 -*-
"""
=======================================================================
  ASA BRAIN  -  AI Security Assistant  (Bo Nao Chatbot)
  SpectraGuard  |  Truong Dai hoc Tai chinh - Marketing (UFM)
=======================================================================
  Chuc nang:
    1. Smart Alert   - Phan tich vi pham, tao canh bao tu dong
    2. Security Chat - Chatbot tra cuu du lieu SQL & tai lieu PDF
    3. Shift Report  - Tu dong tong hop bao cao cuoi ca

  Cai dat:
    pip install google-genai PyMuPDF pyodbc

  Chay thu:
    python src/asa_brain.py
=======================================================================
"""

import os
import io
import time
import re
import sys
import json
import base64
import pyodbc
import datetime
import textwrap
import traceback
from pathlib import Path
from typing import Optional

from db_helper import get_db_connection

# Fix encoding cho Windows terminal
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# --- Gemini SDK moi nhat (google-genai) ---
from google import genai
from google.genai import types as genai_types

# --- PDF (tuy chon) ---
try:
    import fitz  # PyMuPDF
    PDF_SUPPORTED = True
except ImportError:
    PDF_SUPPORTED = False

# =======================================================================
#  CAU HINH TRUNG TAM
# =======================================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6JBviLd0yngyYyPp_bHq4asWxaG1GVr57rbUoNYVRm17A")
GEMINI_MODEL   = "gemini-2.5-flash"      # Model chinh (manh me, ho tro dai han)
FALLBACK_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-2.0-flash-lite",
    "gemini-3-flash-preview"
]

DB_CONFIG = {
    "server"  : os.getenv("DB_SERVER",   "localhost"),
    "database": os.getenv("DB_DATABASE", "WebAnNinh"),
    "username": os.getenv("DB_USERNAME", "sa"),
    "password": os.getenv("DB_PASSWORD", "123"),
}

# Thu muc chua tai lieu noi quy (*.pdf)
DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"
DOCS_DIR.mkdir(exist_ok=True)

FACILITY_NAME = "Truong Dai hoc Tai chinh - Marketing (UFM)"

# =======================================================================
#  SYSTEM INSTRUCTIONS
# =======================================================================

SYSTEM_ALERT = (
    f"Ban la tro ly an ninh cap cao (cap bac Thieu ta) cua he thong giam sat {FACILITY_NAME}. "
    "NHIEM VU: Nhan du lieu tho tu camera AI (loai hanh vi + danh tinh + thoi diem + dia diem) "
    "va chuyen thanh THONG BAO KHAN CAP CO CAU TRUC gui cho bao ve. "
    "QUY TAC: "
    "1. Luon dung tieng Viet. "
    "2. Phan hoi BAT BUOC co 4 phan: TOM TAT | MUC DO | NHAN DINH | HUONG XU LY. "
    "3. Muc do: THAP / TRUNG BINH / CAO / NGHIEM TRONG (kem emoji: 🟢/🟡/🔴/🚨). "
    "4. Huong xu ly: chi dinh cu the to/khu vuc va hanh dong. "
    "5. KHONG giai thich dai dong, KHONG hoi nguoc lai."
)

SYSTEM_CHAT = (
    f"Ban la tro ly thong minh cua doi bao ve {FACILITY_NAME}. "
    "NHIEM VU: Tra loi cau hoi cua bao ve dua tren DU LIEU THUC TE duoc cung cap kem theo. "
    "Du lieu co the la: ket qua truy van SQL, noi dung tai lieu PDF, hoac thong tin su kien. "
    "QUY TAC: "
    "1. Luon dung tieng Viet, than thien nhung chuyen nghiep. "
    "2. Chi tra loi dua tren du lieu trong context, KHONG bia dat con so. "
    "3. Neu khong co du lieu lien quan, noi ro: 'Toi khong tim thay thong tin ve van de nay trong he thong.' "
    "4. Dinh dang ro rang, dung gach dau dong neu liet ke. "
    "5. Khi tra loi ve quy trinh, danh so thu tu cac buoc."
)

SYSTEM_REPORT = (
    f"Ban la chuyen gia phan tich an ninh cua {FACILITY_NAME}. "
    "NHIEM VU: Dua tren danh sach cac su kien trong ca truc, hay viet BAO CAO CUOI CA hoan chinh. "
    "CAU TRUC BAO CAO BAT BUOC: "
    "1. THONG TIN CA TRUC (thoi gian bat dau - ket thuc, ten ca). "
    "2. TONG QUAN HOAT DONG (so su kien theo loai). "
    "3. CAC SU KIEN DANG CHU Y (liet ke chi tiet cac vi pham nghiem trong). "
    "4. DANH GIA TONG THE (nhan dinh ve tinh hinh an ninh). "
    "5. KIEN NGHI (de xuat cai thien neu co). "
    "QUY TAC: Van phong chuyen nghiep, trung lap, co so lieu cu the. "
    "Ket thuc bang: 'Nguoi lap bao cao: He thong ASA - [thoi gian]'."
)

# =======================================================================
#  DATABASE CONNECTOR
# =======================================================================

class DatabaseConnector:
    """Truy van SQL Server qua cung connection pool voi backend.

    Truoc day chatbot tu tao mot ket noi pyodbc va truy van schema cu
    ``violation_history``. Dieu do khien dashboard van hoat dong nhung chatbot
    bao loi ket noi/truy van. Connector nay dung chung db_helper va schema hien
    tai cua ung dung.
    """

    _DRIVERS = [
        "ODBC Driver 17 for SQL Server",
        "ODBC Driver 18 for SQL Server",
        "SQL Server",
    ]

    def __init__(self, config: dict):
        self.config = config
        self._available = False
        self._init_connection()

    def _init_connection(self):
        conn = None
        try:
            conn = get_db_connection()
            self._available = True
            print("[DB] Chatbot is using the backend database pool.")
        except Exception as exc:
            self._available = False
            print(f"[DB] WARNING: Chatbot cannot connect to database: {exc}")
        finally:
            if conn is not None:
                conn.close()

    @property
    def connected(self) -> bool:
        return self._available

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(sql, params)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        except Exception:
            self._available = False
            raise
        finally:
            if conn is not None:
                conn.close()

    def violations_today(self) -> list[dict]:
        return self.query("""
            SELECT e.event_id AS id,
                   COALESCE(c.camera_name, N'Không xác định') AS camera_name,
                   COALESCE(t.event_name, N'Sự kiện khác') AS violation_type,
                   COALESCE(e.notes, N'Không xác định') AS detected_identities,
                   COALESCE(e.processing_status, N'Mới') AS status,
                   e.detected_at AS start_time
            FROM detection_events e
            LEFT JOIN cameras c ON e.camera_id = c.camera_id
            LEFT JOIN event_types t ON e.event_type_id = t.event_type_id
            WHERE CAST(e.detected_at AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY e.detected_at DESC
        """)

    def violations_in_shift(self, start: datetime.datetime, end: datetime.datetime) -> list[dict]:
        return self.query("""
            SELECT e.event_id AS id,
                   COALESCE(c.camera_name, N'Không xác định') AS camera_name,
                   COALESCE(t.event_name, N'Sự kiện khác') AS violation_type,
                   COALESCE(e.notes, N'Không xác định') AS detected_identities,
                   COALESCE(e.processing_status, N'Mới') AS status,
                   e.detected_at AS start_time
            FROM detection_events e
            LEFT JOIN cameras c ON e.camera_id = c.camera_id
            LEFT JOIN event_types t ON e.event_type_id = t.event_type_id
            WHERE e.detected_at BETWEEN ? AND ?
            ORDER BY e.detected_at ASC
        """, (start, end))

    def natural_query(self, question: str) -> str:
        """Anh xa cau hoi tu nhien sang truy van DB co ban."""
        if not self.connected:
            self._init_connection()
        if not self.connected:
            return "[Database chua duoc ket noi]"
        q = question.lower()
        try:
            if any(k in q for k in ["hom nay", "ngay hom nay", "today"]):
                rows = self.violations_today()
                n = len(rows)
                summary = f"Hom nay co {n} su kien duoc ghi nhan.\n"
                return summary + self._fmt(rows)


            

            if "bao ve" in q or "nhan vien" in q:
                rows = self.query("""
                    SELECT COALESCE(s.full_name, u.username) AS full_name,
                           r.role_name AS role
                    FROM users u
                    LEFT JOIN security_staff s ON u.user_id = s.user_id
                    LEFT JOIN roles r ON u.role_id = r.role_id
                    WHERE u.is_active = 1
                    ORDER BY COALESCE(s.full_name, u.username)
                """)
                if rows:
                    names = ", ".join(r.get("full_name") or "?" for r in rows)
                    return f"Danh sach nhan vien: {names}"

            # Fallback: thong ke hom nay
            rows = self.violations_today()
            return f"Tong so su kien hom nay: {len(rows)}\n" + self._fmt(rows)
        except Exception as e:
            return f"[Loi truy van: {e}]"

    @staticmethod
    def _fmt(rows: list[dict]) -> str:
        if not rows:
            return "Khong co su kien nao."
        lines = []
        for r in rows:
            t   = r.get("start_time", "")
            cam = r.get("camera_name", "?")
            vt  = r.get("violation_type", "?")
            ids = r.get("detected_identities", "Khong xac dinh")
            st  = r.get("status", "Chua xu ly")
            lines.append(f"- [{t}] {cam} | {vt} | {ids} | {st}")
        return "\n".join(lines)


# =======================================================================
#  PDF KNOWLEDGE BASE
# =======================================================================

class PDFKnowledgeBase:
    """Doc va tim kiem trong tai lieu PDF noi quy."""

    def __init__(self, docs_dir: Path):
        self.docs_dir = docs_dir
        self._cache: dict[str, str] = {}

    def _load(self, path: Path) -> str:
        key = str(path)
        if key not in self._cache:
            if not PDF_SUPPORTED:
                return ""
            try:
                doc = fitz.open(str(path))
                self._cache[key] = "".join(p.get_text() for p in doc)
                doc.close()
            except Exception as e:
                self._cache[key] = f"[Loi doc PDF: {e}]"
        return self._cache[key]

    def search(self, question: str, top_chars: int = 3000) -> str:
        if not PDF_SUPPORTED:
            return ""
        q_words = set(re.findall(r"\w+", question.lower()))
        best_score, best_chunk = 0, ""
        for f_path in self.docs_dir.glob("*"):
            if f_path.suffix.lower() not in [".pdf", ".txt"]:
                continue
            text = self._load(f_path) if f_path.suffix.lower() == ".pdf" else f_path.read_text(encoding="utf-8", errors="ignore")
            for chunk in textwrap.wrap(text, 500):
                score = len(q_words & set(re.findall(r"\w+", chunk.lower())))
                if score > best_score:
                    best_score, best_chunk = score, chunk
        return best_chunk[:top_chars] if best_score > 0 else ""

    def list_docs(self) -> list[str]:
        return [p.name for p in self.docs_dir.glob("*") if p.suffix.lower() in [".pdf", ".txt"]]


# =======================================================================
#  ASA BRAIN  -  BO NAO CHINH
# =======================================================================

class ASABrain:
    """
    Bo nao Chatbot AI Security Assistant.

    Vi du su dung:
    ---------------
        brain = ASABrain()

        # 1. Tao canh bao thong minh (Smart Alert)
        alert = brain.generate_alert(
            violation_type = "GAY GO / DANH NHAU",
            location       = "San truong - Cam 02",
            identities     = ["Nguyen Van A", "Nguoi la"],
        )
        print(alert["raw"])

        # 2. Chat hoi dap
        reply = brain.chat("Hom nay co bao nhieu vi pham?")
        print(reply)

        # 3. Bao cao cuoi ca
        report = brain.generate_shift_report(shift_start, shift_end)
        print(report)
    """

    def __init__(self):
        self._client = genai.Client(api_key=GEMINI_API_KEY)

        self.db  = DatabaseConnector(DB_CONFIG)
        self.pdf = PDFKnowledgeBase(DOCS_DIR)

        print(f"[ASA Brain] Ready. Model={GEMINI_MODEL}")
        print(f"  Database : {'Connected' if self.db.connected else 'Not connected'}")
        print(f"  PDF docs : {self.pdf.list_docs() or '(empty)'}")

    # -------------------------------------------------------------------
    #  NOI BO: Goi Gemini
    # -------------------------------------------------------------------

    def _call(self, system: str, prompt: str,
              image_bytes: Optional[bytes] = None,
              temperature: float = 0.4,
              max_tokens: int = 1024) -> str:
        """Goi Gemini voi co che fallback (du phong) va retry (thu lai)."""
        
        models_to_try = [GEMINI_MODEL] + FALLBACK_MODELS
        last_error = None

        for model_name in models_to_try:
            for attempt in range(3): # Thu lai toi da 3 lan moi model
                try:
                    parts = [genai_types.Part.from_text(text=prompt)]
                    if image_bytes:
                        parts.insert(0, genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))

                    cfg = genai_types.GenerateContentConfig(
                        system_instruction = system,
                        temperature        = temperature,
                        max_output_tokens  = max_tokens,
                    )
                    resp = self._client.models.generate_content(model=model_name, contents=parts, config=cfg)
                    return resp.text.strip()
                except Exception as e:
                    last_error = e
                    err_msg = str(e).lower()
                    
                    # Neu duoc phep thi nghi mot lat truoc khi thu lai
                    if "503" in err_msg or "rate limit" in err_msg or "quota" in err_msg:
                        time.sleep(1.5 * (attempt + 1))
                        continue
                    break # Cac loi khac thi thu model tiep theo luon
        
        raise last_error or RuntimeError("Tat ca cac model AI deu khong phan hoi.")

    def _call_chat(self, user_message: str, session_history: list[dict]) -> str:
        """Goi Gemini Chat voi co che fallback."""
        session_history.append({"role": "user", "parts": [{"text": user_message}]})

        models_to_try = [GEMINI_MODEL] + FALLBACK_MODELS
        last_error = None

        for model_name in models_to_try:
            for attempt in range(2):
                try:
                    cfg = genai_types.GenerateContentConfig(
                        system_instruction = SYSTEM_CHAT,
                        temperature        = 0.5,
                        max_output_tokens  = 1024,
                    )
                    resp = self._client.models.generate_content(model=model_name, contents=session_history, config=cfg)
                    reply = resp.text.strip()
                    session_history.append({"role": "model", "parts": [{"text": reply}]})
                    return reply
                except Exception as e:
                    last_error = e
                    if "503" in str(e) or "429" in str(e):
                        time.sleep(2)
                        continue
                    break
        
        if session_history: session_history.pop()
        raise last_error or RuntimeError("Hub AI dang tam thoi gian doan. Vui long thu lai sau giay lat.")

    # -------------------------------------------------------------------
    #  TINH NANG 1: SMART ALERT
    # -------------------------------------------------------------------

    def generate_alert(
        self,
        violation_type : str,
        location       : str,
        identities     : list[str],
        timestamp      : Optional[datetime.datetime] = None,
        image_base64   : Optional[str] = None,
        extra_context  : str = "",
    ) -> dict:
        """
        Phan tich vi pham tu camera AI va tao thong bao khan cap.

        Args:
            violation_type : Loai vi pham (VD: "GAY GO / DANH NHAU")
            location       : Dia diem   (VD: "San truong - Cam 02")
            identities     : Danh sach dinh danh (VD: ["Nguyen A", "Nguoi la"])
            timestamp      : Thoi diem (mac dinh = bay gio)
            image_base64   : Anh vi pham ma hoa Base64 (tuy chon)
            extra_context  : Ngu canh bo sung

        Returns:
            dict voi cac truong:
                raw, summary, severity, severity_emoji, action,
                timestamp, violation_type, location, identities
        """
        ts     = timestamp or datetime.datetime.now()
        ts_str = ts.strftime("%H:%M:%S ngay %d/%m/%Y")
        ids_str = ", ".join(identities) if identities else "Khong xac dinh"

        prompt = (
            "DU LIEU TU CAMERA AI:\n"
            f"- Thoi diem    : {ts_str}\n"
            f"- Dia diem     : {location}\n"
            f"- Loai vi pham : {violation_type}\n"
            f"- Doi tuong    : {ids_str}\n"
            + (f"- Ghi chu them : {extra_context}\n" if extra_context else "")
            + "\nHay tao thong bao khan cap theo cau truc: TOM TAT | MUC DO | NHAN DINH | HUONG XU LY."
        )

        image_bytes = base64.b64decode(image_base64) if image_base64 else None

        try:
            raw = self._call(
                system      = SYSTEM_ALERT,
                prompt      = prompt,
                image_bytes = image_bytes,
                temperature = 0.3,
                max_tokens  = 512,
            )
        except Exception as e:
            raw = f"[Loi tao canh bao: {e}]"

        return {
            "raw"           : raw,
            "summary"       : self._section(raw, "TOM TAT"),
            "severity"      : self._severity_text(raw),
            "severity_emoji": self._severity_emoji(raw),
            "action"        : self._section(raw, "HUONG XU LY"),
            "timestamp"     : ts.isoformat(),
            "violation_type": violation_type,
            "location"      : location,
            "identities"    : identities,
        }

    # -------------------------------------------------------------------
    #  TINH NANG 2: SECURITY CHAT
    # -------------------------------------------------------------------

    def chat(self, user_message: str, session_history: list[dict], reset: bool = False) -> str:
        """
        Chatbot hoi dap voi bao ve.
        Tu dong tra cuu Database SQL va tai lieu PDF truoc khi tra loi.

        Args:
            user_message    : Cau hoi hoac yeu cau cua bao ve
            session_history : Lich su chat rieng cua tung session
            reset           : True = bat dau phien hoi thoai moi

        Returns:
            Chuoi phan hoi
        """
        if reset:
            session_history.clear()

        if not user_message.strip():
            return "Ban can hoi gi khong? Toi san sang ho tro."

        # --- Thu thap context ---
        ctx_parts = []

        try:
            db_data = self.db.natural_query(user_message)
            if db_data:
                ctx_parts.append(f"[DU LIEU DATABASE]\n{db_data}")
        except Exception as e:
            ctx_parts.append(f"[Loi DB: {e}]")

        pdf_data = self.pdf.search(user_message)
        if pdf_data:
            ctx_parts.append(f"[NOI QUY / TAI LIEU]\n{pdf_data}")

        # --- Ghep context vao prompt ---
        if ctx_parts:
            full_msg = (
                "CONTEXT HE THONG:\n"
                + "\n\n".join(ctx_parts)
                + "\n\n---\nCAU HOI: "
                + user_message
            )
        else:
            full_msg = user_message

        try:
            return self._call_chat(full_msg, session_history)
        except Exception as e:
            return f"Xin loi, toi dang gap su co ky thuat. ({e})"

    def chat_with_image(self, user_message: str, image_base64: str) -> str:
        """Chat kem anh (bao ve chup anh hoi ve tinh huong)."""
        try:
            image_bytes = base64.b64decode(image_base64)
            return self._call(
                system      = SYSTEM_CHAT,
                prompt      = user_message,
                image_bytes = image_bytes,
            )
        except Exception as e:
            return f"Khong the phan tich hinh anh. ({e})"

    # -------------------------------------------------------------------
    #  TINH NANG 3: SHIFT REPORT
    # -------------------------------------------------------------------

    def generate_shift_report(
        self,
        shift_start : datetime.datetime,
        shift_end   : datetime.datetime,
        shift_name  : str = "Ca truc",
        guard_name  : str = "Nhan vien truc",
        extra_notes : str = "",
    ) -> str:
        """
        Tu dong tong hop bao cao cuoi ca tu database.

        Args:
            shift_start : Thoi gian bat dau ca
            shift_end   : Thoi gian ket thuc ca
            shift_name  : Ten ca (VD: "Ca Sang (06:00-14:00)")
            guard_name  : Ten nhan vien truc
            extra_notes : Ghi chu bo sung tu bao ve

        Returns:
            Chuoi bao cao hoan chinh
        """
        # --- Lay du lieu ---
        violations: list[dict] = []
        if self.db.connected:
            try:
                violations = self.db.violations_in_shift(shift_start, shift_end)
            except Exception as e:
                print(f"[Report] DB error: {e}")

        total = len(violations)
        type_count: dict[str, int] = {}
        for v in violations:
            vt = v.get("violation_type", "Khac")
            type_count[vt] = type_count.get(vt, 0) + 1

        type_lines = "\n".join(f"  - {k}: {n} su kien" for k, n in type_count.items()) or "  - Khong co"
        detail = DatabaseConnector._fmt(violations)

        prompt = (
            f"THONG TIN CA TRUC:\n"
            f"- Ten ca        : {shift_name}\n"
            f"- Bat dau       : {shift_start.strftime('%H:%M %d/%m/%Y')}\n"
            f"- Ket thuc      : {shift_end.strftime('%H:%M %d/%m/%Y')}\n"
            f"- Nhan vien truc: {guard_name}\n\n"
            f"THONG KE SU KIEN (tong {total}):\n{type_lines}\n\n"
            f"CHI TIET:\n{detail}\n\n"
            + (f"GHI CHU THEM: {extra_notes}\n\n" if extra_notes else "")
            + "Hay viet bao cao cuoi ca hoan chinh theo cau truc 5 phan."
        )

        try:
            return self._call(
                system      = SYSTEM_REPORT,
                prompt      = prompt,
                temperature = 0.2,
                max_tokens  = 2048,
            )
        except Exception as e:
            # Fallback bao cao toi gian
            return (
                f"BAO CAO CUOI CA - {shift_name}\n"
                f"Thoi gian: {shift_start} --> {shift_end}\n"
                f"Tong su kien: {total}\n"
                + type_lines + "\n\nChi tiet:\n" + detail
            )

    # -------------------------------------------------------------------
    #  UTILITY METHODS
    # -------------------------------------------------------------------

    @staticmethod
    def _section(text: str, title: str) -> str:
        """Trich xuat noi dung mot phan trong van ban."""
        pat = rf"(?:#{1,3}\s*|\*{{1,2}})?{re.escape(title)}[:\s*_]{{0,5}}\n?(.*?)(?=\n#|\n\*{{1,2}}[A-Z\u0110\u00C0-\u1EF9]|\Z)"
        m = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        return (m.group(1) or "").strip()[:300] if m else text[:200]

    @staticmethod
    def _severity_emoji(text: str) -> str:
        for e in ["\U0001f6a8", "\U0001f534", "\U0001f7e1", "\U0001f7e2"]:
            if e in text:
                return e
        return "\U0001f7e1"  # Mau vang = TRUNG BINH mac dinh

    @staticmethod
    def _severity_text(text: str) -> str:
        for lvl in ["NGHIEM TRONG", "CAO", "TRUNG BINH", "THAP"]:
            if lvl in text.upper():
                return lvl
        return "TRUNG BINH"


# =======================================================================
#  DEMO CLI (chay: python src/asa_brain.py)
# =======================================================================

def demo_cli():
    print("\n" + "=" * 62)
    print("  ASA BRAIN - Demo CLI")
    print("  AI Security Assistant | SpectraGuard UFM")
    print("=" * 62)

    brain = ASABrain()

    menu = """
Chon che do:
  1. Smart Alert   (mo phong phat hien vi pham)
  2. Security Chat (hoi dap tu do)
  3. Shift Report  (tao bao cao ca truc)
  4. Thoat
"""
    while True:
        print(menu)
        choice = input("Nhap so (1-4): ").strip()

        if choice == "1":
            print("\n--- DEMO: Smart Alert ---")
            alert = brain.generate_alert(
                violation_type = "GAY GO / DANH NHAU",
                location       = "San truong - Cam 02",
                identities     = ["Nguyen Van A", "Nguoi la #1"],
                extra_context  = "2 nguoi tu tap, phat hien luc 2h sang",
            )
            print("\n>>> KET QUA CANH BAO:\n")
            print(alert["raw"])
            print(f"\n  Muc do : {alert['severity_emoji']} {alert['severity']}")

        elif choice == "2":
            print("\n--- DEMO: Security Chat (go 'thoat' de dung) ---")
            brain.chat("", reset=True)
            while True:
                msg = input("\nBao ve: ").strip()
                if msg.lower() in ("thoat", "quit", "exit", "q"):
                    break
                if not msg:
                    continue
                reply = brain.chat(msg)
                print(f"\nASA: {reply}")

        elif choice == "3":
            print("\n--- DEMO: Shift Report ---")
            now   = datetime.datetime.now()
            start = now.replace(hour=6,  minute=0, second=0, microsecond=0)
            end   = now.replace(hour=14, minute=0, second=0, microsecond=0)
            report = brain.generate_shift_report(
                shift_start = start,
                shift_end   = end,
                shift_name  = "Ca Sang (06:00 - 14:00)",
                guard_name  = "Nguyen Bao Ve",
            )
            print("\n>>> BAO CAO CUOI CA:\n")
            print(report)

        elif choice == "4":
            print("Da thoat. Tam biet!")
            break
        else:
            print("Lua chon khong hop le, vui long nhap 1-4.")


if __name__ == "__main__":
    demo_cli()
