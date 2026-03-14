-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privacy_policy_accepted_at" TIMESTAMP(3),
ADD COLUMN     "privacy_policy_version" TEXT;
