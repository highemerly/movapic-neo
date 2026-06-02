-- CreateTable
CREATE TABLE "login_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(500),
    "country" VARCHAR(2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_jti_key" ON "login_sessions"("jti");

-- CreateIndex
CREATE INDEX "login_sessions_user_id_created_at_idx" ON "login_sessions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
