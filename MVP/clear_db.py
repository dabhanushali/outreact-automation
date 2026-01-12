import sqlite3
import os

db_path = 'd:/OutReach/MVP/backlinks.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("DELETE FROM prospects")
    conn.commit()
    print(f"Deleted all rows from {db_path}")
    conn.close()
else:
    print("DB not found.")
