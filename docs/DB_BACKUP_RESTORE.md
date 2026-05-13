# Main DB Backup Restore

Backup file:

- `main_db_backup_20260326_133547.sql.gz`

Source:

- Remote server `199.188.200.186`
- SSH user `speeuvmq`
- PostgreSQL database `speeuvmq_speednet_office`

## Restore

1. Copy the backup to the target server or local machine.
2. Decompress it:

```bash
gunzip -c main_db_backup_20260326_133547.sql.gz > main_db_backup_20260326_133547.sql
```

3. Restore into PostgreSQL:

```bash
psql -h <host> -U <user> -d <database> -f main_db_backup_20260326_133547.sql
```

## Notes

- The dump was created with `--no-owner` and `--no-privileges`.
- It is a compressed plain SQL dump, not a custom-format archive.
- Make sure the target database exists before restoring.
