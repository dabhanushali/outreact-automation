import sqlite3
import pandas as pd

con = sqlite3.connect('d:/OutReach/MVP/backlinks.db')
# Select specific columns to see content
df = pd.read_sql_query("SELECT company_name, url FROM prospects", con)
pd.set_option('display.max_colwidth', None) # Show full text
print(df)
con.close()
