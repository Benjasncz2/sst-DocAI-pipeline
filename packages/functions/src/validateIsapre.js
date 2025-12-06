import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { Resource } from "sst";

const snsClient = new SNSClient({});

export const main = async (event) => {
    try {
        for (const record of event.Records) {
            const message = JSON.parse(record.Sns.Message);
            console.log("Validando datos de:", message.Id);

            // Ejemplo simple de validación
            const camposValidos = message.Resultados?.length > 0;

            const payload = {
                Id: message.Id,
                Validado: camposValidos,
                Resultados: message.Resultados,
                FechaValidacion: new Date().toISOString(),
            };

            const command = new PublishCommand({
                Message: JSON.stringify(payload),
                TopicArn: Resource.IsapreTopic.arn,
            });

            await snsClient.send(command);

            console.log("Datos validados enviados a ISAPRE SNS");
        }

        return { statusCode: 200, body: "Validación completada" };
    } catch (err) {
        console.error("Error validando datos:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
