import sqlite3
import os

db_path = os.path.join(os.getcwd(), "data.db")

connection = sqlite3.connect(db_path)
db = connection.cursor()

db.execute("""
CREATE TABLE themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
)
""")

db.execute("""
CREATE TABLE scopes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cluster_scope_id INTEGER
)
""")

db.execute("""
CREATE TABLE colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    scope_id INTEGER NOT NULL,
    color TEXT NOT NULL,
    FOREIGN KEY (theme_id) REFERENCES themes(id),
    FOREIGN KEY (scope_id) REFERENCES scopes(id)
)
""")

connection.commit()
connection.close()
