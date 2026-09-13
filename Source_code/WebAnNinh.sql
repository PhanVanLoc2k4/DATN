-- Run after SQLQuery.sql. Matches the current backend/db_helper.py init_db().
-- Adds missing columns only; preserves existing rows and column definitions.
USE [WebAnNinh];
GO
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.users', N'U') IS NULL
        OR OBJECT_ID(N'dbo.security_staff', N'U') IS NULL
        OR OBJECT_ID(N'dbo.cameras', N'U') IS NULL
        THROW 50001, 'Missing base tables. Run SQLQuery.sql on a new database first.', 1;

    IF COL_LENGTH(N'dbo.users', N'full_name') IS NULL
        ALTER TABLE dbo.users ADD full_name NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.users', N'employee_code') IS NULL
        ALTER TABLE dbo.users ADD employee_code NVARCHAR(30) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'UX_users_employee_code')
        EXEC(N'CREATE UNIQUE INDEX UX_users_employee_code ON dbo.users(employee_code) WHERE employee_code IS NOT NULL');
    IF COL_LENGTH(N'dbo.users', N'phone') IS NULL
        ALTER TABLE dbo.users ADD phone NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.users', N'email') IS NULL
        ALTER TABLE dbo.users ADD email NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.users', N'dob') IS NULL
        ALTER TABLE dbo.users ADD dob NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.users', N'avatar_url') IS NULL
        ALTER TABLE dbo.users ADD avatar_url NVARCHAR(500) NULL;

    IF COL_LENGTH(N'dbo.security_staff', N'email') IS NULL
        ALTER TABLE dbo.security_staff ADD email NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.security_staff', N'dob') IS NULL
        ALTER TABLE dbo.security_staff ADD dob NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.security_staff', N'avatar_url') IS NULL
        ALTER TABLE dbo.security_staff ADD avatar_url NVARCHAR(500) NULL;

    IF COL_LENGTH(N'dbo.cameras', N'crowd_threshold') IS NULL
        ALTER TABLE dbo.cameras ADD crowd_threshold INT NULL DEFAULT 8;
    IF COL_LENGTH(N'dbo.cameras', N'crowd_duration') IS NULL
        ALTER TABLE dbo.cameras ADD crowd_duration INT NULL DEFAULT 30;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
