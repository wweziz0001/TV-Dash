DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'RecordingRule'
    ) THEN
        ALTER TABLE "RecordingRule" ALTER COLUMN "weekdays" DROP DEFAULT;
    END IF;
END $$;
