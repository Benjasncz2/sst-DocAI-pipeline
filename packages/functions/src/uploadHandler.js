import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { Resource } from "sst";

const s3Client = new S3Client({});

export const main = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");
        const { imageBase64 } = body;

        if (!imageBase64) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Falta el campo imageBase64" }),
            };
        }

        const buffer = Buffer.from(imageBase64, "base64");
        const key = `${uuidv4()}.jpg`;

        const command = new PutObjectCommand({
            Bucket: Resource.DocAiBucket.name,
            Key: key,
            Body: buffer,
            ContentType: "image/jpeg",
        });

        await s3Client.send(command);

        console.log(`Imagen subida: ${key}`);

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            body: JSON.stringify({ message: "Imagen subida correctamente", key }),
        };
    } catch (err) {
        console.error("Error subiendo imagen:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
