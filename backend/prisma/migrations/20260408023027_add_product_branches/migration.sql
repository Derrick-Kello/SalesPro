-- CreateTable
CREATE TABLE "_ProductBranches" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProductBranches_AB_unique" ON "_ProductBranches"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductBranches_B_index" ON "_ProductBranches"("B");

-- AddForeignKey
ALTER TABLE "_ProductBranches" ADD CONSTRAINT "_ProductBranches_A_fkey" FOREIGN KEY ("A") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductBranches" ADD CONSTRAINT "_ProductBranches_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
