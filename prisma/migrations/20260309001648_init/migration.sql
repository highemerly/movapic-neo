-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "domain" VARCHAR(511) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "remote_id" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "email_prefix" VARCHAR(32) NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "overlay_text" TEXT NOT NULL,
    "position" VARCHAR(20) NOT NULL,
    "font" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "size" VARCHAR(20) NOT NULL,
    "output_format" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'web',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instances_domain_key" ON "instances"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_prefix_key" ON "users"("email_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "users_instance_id_remote_id_key" ON "users"("instance_id", "remote_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_instance_id_username_key" ON "users"("instance_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");

-- CreateIndex
CREATE INDEX "images_user_id_created_at_idx" ON "images"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "images_is_public_created_at_idx" ON "images"("is_public", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
