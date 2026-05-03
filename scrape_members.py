import subprocess
import time
import json
import re
import os
import sys
import winsound
from PIL import Image
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

ADB = r"C:\Users\fabyj\Downloads\platform-tools-latest-windows\platform-tools\adb.exe"
DEVICE = "127.0.0.1:5585"
OUTPUT = r"C:\Users\fabyj\projects\foundry-planner\members.json"
SCREENSHOT = r"C:\Users\fabyj\projects\foundry-planner\_live.png"

def screenshot():
    with open(SCREENSHOT, "wb") as f:
        subprocess.run([ADB, "-s", DEVICE, "exec-out", "screencap", "-p"], stdout=f)

def ocr_profile():
    img = Image.open(SCREENSHOT)
    w, h = img.size
    # Crop the info panel including name row
    crop = img.crop((0, int(h * 0.62), w, int(h * 0.90)))
    text = pytesseract.image_to_string(crop)
    return text

def parse_profile(text):
    id_match = re.search(r'ID[:\s]+(\d{6,12})', text)
    # Full name including tag, e.g. "[HOC]Jr16" or just the first line
    name_match = re.search(r'(\[HOC\]\S+)', text)
    if not name_match:
        name_match = re.search(r'^\s*(\S+)', text)
    if id_match:
        player_id = id_match.group(1)
        player_name = name_match.group(1).strip() if name_match else "unknown"
        return player_id, player_name
    return None, None

def load_existing():
    if os.path.exists(OUTPUT):
        with open(OUTPUT) as f:
            return json.load(f)
    return {}

def save(members):
    with open(OUTPUT, "w") as f:
        json.dump(members, f, indent=2)

def is_profile_screen():
    img = Image.open(SCREENSHOT)
    w, h = img.size
    # Sample top strip for "Chief Profile" text
    crop = img.crop((0, 0, w, int(h * 0.08)))
    text = pytesseract.image_to_string(crop)
    return "Chief" in text or "Profile" in text

members = load_existing()
last_id = None
print(f"Watching for profiles... ({len(members)} already captured)")
print("Open profiles one by one. Press Ctrl+C when done.\n")

try:
    while True:
        screenshot()
        if is_profile_screen():
            pid, name = parse_profile(ocr_profile())
            if pid and pid != last_id:
                members[pid] = {"id": pid, "inGameName": name}
                save(members)
                last_id = pid
                print(f"  Captured: {name} -> {pid}  (total: {len(members)})")
                subprocess.Popen(
                    ['powershell', '-c',
                     'Add-Type -AssemblyName System.Speech; '
                     '(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak("next")'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
        time.sleep(1.5)
except KeyboardInterrupt:
    print(f"\nDone. {len(members)} members saved to {OUTPUT}")
