from backlink_manager import init_db

if __name__ == "__main__":
    print("Migrating Database...")
    init_db()
    print("Migration Complete.")
