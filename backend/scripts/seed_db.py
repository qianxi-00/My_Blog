#!/usr/bin/env python3
"""Seed blog.db from compressed data parts"""
import os, sys, gzip, base64

DB_PATH = "/data/blog.db"
PARTS_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

def rebuild():
    if os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 1024:
        print(f"DB already exists ({os.path.getsize(DB_PATH)/1024:.0f}KB), skipping")
        return

    combined = ""
    part_idx = 0
    while True:
        part_file = os.path.join(PARTS_DIR, f"db_part_{part_idx}.dat")
        if not os.path.exists(part_file):
            break
        with open(part_file) as f:
            combined += f.read().strip()
        part_idx += 1

    if not combined:
        print(f"No data parts found in {PARTS_DIR}")
        return

    raw = base64.b64decode(combined)
    data = gzip.decompress(raw)
    with open(DB_PATH, "wb") as f:
        f.write(data)
    print(f"DB seeded: {len(data)/1024/1024:.0f}MB ({part_idx} parts)")

if __name__ == "__main__":
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    rebuild()
