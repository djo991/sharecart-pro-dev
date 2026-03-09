export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const data = url.searchParams.get("data");

    if (!data) {
        return new Response("Missing data parameter", {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }

    try {
        // Fetch a PNG QR code from the external service
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&format=png&margin=0&data=${encodeURIComponent(data)}`;
        const qrResponse = await fetch(qrUrl);

        if (!qrResponse.ok) {
            throw new Error(`QR Server returned ${qrResponse.status}`);
        }

        const arrayBuffer = await qrResponse.arrayBuffer();
        const b64 = Buffer.from(arrayBuffer).toString("base64");

        // Pipe it back to the storefront as text/plain
        return new Response(b64, {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("[/api/qr] Error proxying QR code:", error);
        return new Response("Error generating QR code", {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }
};
