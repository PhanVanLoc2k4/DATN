import cv2
import numpy as np
import os
from ultralytics import YOLO
import insightface
from sklearn.metrics.pairwise import cosine_similarity

# ================= PATH =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
WEBSITE_DIR = os.path.dirname(BACKEND_DIR)
PROJECT_DIR = os.path.dirname(WEBSITE_DIR)

MODEL_PATH = os.path.join(PROJECT_DIR, "model", "behavior_model.pt")
DB_PATH = os.path.join(PROJECT_DIR, "model", "face_database", "face_database.npz")

# ================= LOAD =================
model = YOLO(MODEL_PATH)

face_app = insightface.app.FaceAnalysis(name="buffalo_l")
face_app.prepare(ctx_id=-1)

data = np.load(DB_PATH)
db_embeddings = data["embeddings"]
db_names = data["names"]

db_embeddings = db_embeddings / np.linalg.norm(db_embeddings, axis=1, keepdims=True)


# ================= REALTIME PROCESS =================
def process_frame(frame):

    results = model.track(frame, persist=True, verbose=False)

    if results and results[0].boxes is not None:

        boxes = results[0].boxes.xyxy.cpu().numpy()
        confs = results[0].boxes.conf.cpu().numpy()
        cls = results[0].boxes.cls.cpu().numpy()

        for box, c, conf in zip(boxes, cls, confs):

            if conf < 0.5:
                continue

            class_name = model.names[int(c)]

            if class_name != "fight":
                continue

            x1, y1, x2, y2 = map(int, box)

            # ===== FACE =====
            person = frame[y1:y2, x1:x2]

            name = "unknown"

            try:
                faces = face_app.get(person)
                if faces:
                    emb = faces[0].embedding
                    emb = emb / np.linalg.norm(emb)
                    emb = emb.reshape(1, -1)

                    sims = cosine_similarity(emb, db_embeddings)[0]
                    best_idx = np.argmax(sims)

                    if sims[best_idx] > 0.6:
                        name = db_names[best_idx]
            except:
                pass

            # ===== DRAW =====
            color = (0, 255, 0) if name != "unknown" else (0, 0, 255)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame,
                        f"{name} - FIGHT",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        color,
                        2)

    return frame 