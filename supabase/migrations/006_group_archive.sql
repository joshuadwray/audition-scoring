-- Migration 006: Add is_archived column to dancer_groups for soft delete
ALTER TABLE dancer_groups ADD COLUMN is_archived BOOLEAN DEFAULT false;
