import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const main = async (event) => {
    try {
        for (const record of event.Records) {
            const message = JSON.parse(record.Sns.Message);
            console.log("Mensaje recibido desde SNS:", message);

            const camposConConfianza = {};

            if (message.Resultados && Array.isArray(message.Resultados)) {
                console.log("Procesando resultados:", JSON.stringify(message.Resultados, null, 2));
                message.Resultados.forEach((resultado) => {
                    const nombreCampo = resultado.campo;
                    console.log(`Campo detectado: "${nombreCampo}" = "${resultado.valor}"`);
                    camposConConfianza[nombreCampo] = {
                        valor: resultado.valor,
                        confianza: resultado.confianza
                    };
                });
            }

            const item = {
                Id: message.Id,
                FechaProcesamiento: new Date().toISOString(),
                DatosCompletos: camposConConfianza,
                ResultadosOriginales: message.Resultados,
            };

            const command = new PutCommand({
                TableName: Resource.DocAiResultsTable.name,
                Item: item,
            });

            await docClient.send(command);

            console.log(`Guardado en DynamoDB: ${message.Id}`);
        }

        return { statusCode: 200, body: "Datos almacenados en DynamoDB" };
    } catch (err) {
        console.error("Error guardando en DynamoDB:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
