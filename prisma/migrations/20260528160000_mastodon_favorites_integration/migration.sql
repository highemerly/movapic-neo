-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_image_id_fkey";

-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_fkey";

-- AlterTable
ALTER TABLE "images" ADD COLUMN     "favoriters_cache" JSONB,
ADD COLUMN     "favorites_synced_at" TIMESTAMP(3),
ADD COLUMN     "post_id" VARCHAR(255);

-- DropTable
DROP TABLE "favorites";
