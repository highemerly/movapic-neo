-- AlterTable
ALTER TABLE "images" ADD COLUMN     "camera_make" VARCHAR(100),
ADD COLUMN     "camera_model" VARCHAR(100),
ADD COLUMN     "captured_at" TIMESTAMP(3),
ADD COLUMN     "location_city" VARCHAR(100),
ADD COLUMN     "location_prefecture" VARCHAR(50);
