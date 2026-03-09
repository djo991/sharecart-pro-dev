import prisma from "../db.server";

export async function attachPromoCodes(shareLinkId, codes) {
  if (!codes || codes.length === 0) return [];

  return prisma.promoCode.createMany({
    data: codes.map((code) => ({
      code,
      shareLinkId,
    })),
  });
}

export async function getPromoCodesForShareLink(shareLinkId) {
  return prisma.promoCode.findMany({
    where: { shareLinkId },
  });
}

export async function replacePromoCodes(shareLinkId, codes) {
  await prisma.promoCode.deleteMany({ where: { shareLinkId } });
  if (!codes || codes.length === 0) return [];
  return attachPromoCodes(shareLinkId, codes);
}
