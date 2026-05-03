---
name: HOC Member Import
description: Notes from bulk-importing HOC alliance members into Firestore
type: project
---

The HOC alliance (allianceId: "hoc" lowercase) roster was bulk-imported via ADB + OCR scraping from BlueStacks.

**Key facts:**
- Alliance document ID in Firestore is "hoc" (lowercase) — NOT "HOC"
- ADB connects to BlueStacks at 127.0.0.1:5585
- ADB platform tools at: C:\Users\fabyj\Downloads\platform-tools-latest-windows\platform-tools\adb.exe
- Touch sensor max range: 32767x32767 (event device /dev/input/event4)
- Screen resolution: 720x1280
- R1 members are NOT included in the roster (only R5, R4, R3)
- Total roster target: 88 players
- Import scripts left in project root: scrape_members.py, import_members.mjs, members.json

**Why:** One-time import to seed the roster so players don't have to self-register.
**How to apply:** If re-importing or adding members, always use allianceId "hoc" (lowercase). Never overwrite existing player docs — use updateMask to patch only changed fields.
