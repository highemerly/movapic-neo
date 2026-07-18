-- AlterTable
ALTER TABLE "instances" ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "client_secret" TEXT,
ADD COLUMN     "app_redirect_uri" VARCHAR(1024);
