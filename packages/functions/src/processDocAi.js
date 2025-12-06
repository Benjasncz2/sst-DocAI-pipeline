import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { Resource } from "sst";

const s3Client = new S3Client({});
const snsClient = new SNSClient({});

export const main = async (event) => {
    try {
        const record = event.Records[0];
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

        console.log(`Procesando imagen: ${key}`);

        const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
        const data = await s3Client.send(getCommand);
        const imageBuffer = await streamToBuffer(data.Body);

        process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/task/credenciales.json";

        const client = new DocumentProcessorServiceClient({
            apiEndpoint: `${process.env.DOCUMENT_AI_LOCATION}-documentai.googleapis.com`,
        });

        const name = client.processorVersionPath(
            process.env.DOCUMENT_AI_PROJECT_ID,
            process.env.DOCUMENT_AI_LOCATION,
            process.env.DOCUMENT_AI_PROCESSOR_ID,
            process.env.DOCUMENT_AI_PROCESSOR_VERSION_ID
        );

        const [result] = await client.processDocument({
            name,
            rawDocument: { content: imageBuffer, mimeType: "image/jpeg" },
        });

        const doc = result.document;
        const entities =
            doc.entities?.map((e) => ({
                campo: e.type_,
                valor: e.mentionText,
                confianza: e.confidence,
            })) || [];

        const message = JSON.stringify({ Id: key, Resultados: entities });

        const publishCommand = new PublishCommand({
            Message: message,
            TopicArn: Resource.DocAiTopic.arn,
        });

        await snsClient.send(publishCommand);

        console.log("Resultados enviados a SNS");
        return { statusCode: 200, body: message };
    } catch (err) {
        console.error("Error procesando imagen:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};


async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
