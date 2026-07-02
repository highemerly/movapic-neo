-- AlterTable: 利用規約・プライバシーポリシーへの同意日時。null=未同意。
ALTER TABLE "users" ADD COLUMN "terms_agreed_at" TIMESTAMP(3);
