CREATE UNIQUE INDEX "idx_family_members_linked_user_unique" ON "family_members" USING btree ("linked_user_id") WHERE "family_members"."linked_user_id" IS NOT NULL;
