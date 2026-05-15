ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 'Low';

UPDATE "Task"
SET "priority" = CASE
  WHEN "progress" >= 100 THEN 'Done'
  WHEN "progress" >= 67 THEN 'High'
  WHEN "progress" >= 34 THEN 'Medium'
  ELSE 'Low'
END;
