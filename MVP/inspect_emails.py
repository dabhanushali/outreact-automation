import sqlite3
import pandas as pd

con = sqlite3.connect('d:/OutReach/MVP/backlinks.db')
df = pd.read_sql_query("SELECT company_name, contact_email FROM prospects", con)
pd.set_option('display.max_colwidth', None)
print(df)
con.close()
