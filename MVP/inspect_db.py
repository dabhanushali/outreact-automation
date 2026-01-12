import sqlite3
import pandas as pd

con = sqlite3.connect('d:/OutReach/MVP/backlinks.db')
df = pd.read_sql_query("SELECT * FROM prospects", con)
print(df.head(10))
print(f"\nTotal Rows: {len(df)}")
con.close()
