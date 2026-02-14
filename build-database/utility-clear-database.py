import sqlite3
import os

db_path = os.path.join(os.getcwd(), "data.db")

connection = sqlite3.connect(db_path)
db = connection.cursor()

db.execute("""
DROP TABLE themes
""")

db.execute("""
DROP TABLE scopes
""")

db.execute("""
DROP TABLE colors
""")

connection.commit()
connection.close()
