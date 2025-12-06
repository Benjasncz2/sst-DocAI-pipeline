/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
    app(input) {
        return {
            name: "sst-docai-pipeline",
            removal: input?.stage === "production" ? "retain" : "remove",
            home: "aws",
        };
    },
    async run() {

        const bucket = new sst.aws.Bucket("DocAiBucket", {
            public: false,
        });

        const table = new sst.aws.Dynamo("DocAiResultsTable", {
            fields: {
                Id: "string",
            },
            primaryIndex: { hashKey: "Id" },
        });

        const docAiTopic = new sst.aws.SnsTopic("DocAiTopic");
        const isapreTopic = new sst.aws.SnsTopic("IsapreTopic");

        const environment = {
            BUCKET: bucket.name,
            DDB_TABLE: table.name,
            SNS_DOCAI_ARN: docAiTopic.arn,
            SNS_ISAPRE_ARN: isapreTopic.arn,
            DOCUMENT_AI_PROJECT_ID: "river-lane-475622-h4",
            DOCUMENT_AI_LOCATION: "us",
            DOCUMENT_AI_PROCESSOR_ID: "96bb7d8eb391dbe4",
            DOCUMENT_AI_PROCESSOR_VERSION_ID: "88c682cff5acfff7",
        };

        const uploadHandler = new sst.aws.Function("UploadHandler", {
            handler: "packages/functions/src/uploadHandler.main",
            runtime: "nodejs20.x",
            timeout: "30 seconds",
            environment,
            link: [bucket],
            permissions: [
                {
                    actions: ["s3:PutObject"],
                    resources: [$interpolate`${bucket.arn}/*`],
                },
            ],
        });

        const api = new sst.aws.ApiGatewayV2("DocAiApi");
        api.route("POST /upload", uploadHandler.arn);

        const processDocAi = new sst.aws.Function("ProcessDocAi", {
            handler: "packages/functions/src/processDocAi.main",
            runtime: "nodejs20.x",
            timeout: "60 seconds",
            memorySize: "512 MB",
            environment,
            link: [bucket, docAiTopic],
            permissions: [
                {
                    actions: ["s3:GetObject"],
                    resources: [$interpolate`${bucket.arn}/*`],
                },
                {
                    actions: ["sns:Publish"],
                    resources: [docAiTopic.arn],
                },
            ],
            nodejs: {
                install: ["@google-cloud/documentai"],
            },
            copyFiles: [
                {
                    from: "credenciales.json",
                    to: "credenciales.json",
                },
            ],
        });

        const saveResults = new sst.aws.Function("SaveResults", {
            handler: "packages/functions/src/saveResults.main",
            runtime: "nodejs20.x",
            timeout: "30 seconds",
            environment,
            link: [table],
            permissions: [
                {
                    actions: ["dynamodb:PutItem"],
                    resources: [table.arn],
                },
            ],
        });

        docAiTopic.subscribe(saveResults.arn);

        const validateIsapre = new sst.aws.Function("ValidateIsapre", {
            handler: "packages/functions/src/validateIsapre.main",
            runtime: "nodejs20.x",
            timeout: "30 seconds",
            environment,
            link: [isapreTopic],
            permissions: [
                {
                    actions: ["sns:Publish"],
                    resources: [isapreTopic.arn],
                },
            ],
        });

        isapreTopic.subscribe(validateIsapre.arn);

        new aws.lambda.Permission("S3InvokeProcessDocAi", {
            action: "lambda:InvokeFunction",
            function: processDocAi.arn,
            principal: "s3.amazonaws.com",
            sourceArn: bucket.arn,
        });

        new aws.s3.BucketNotification("DocAiBucketNotification", {
            bucket: bucket.name,
            lambdaFunctions: [{
                lambdaFunctionArn: processDocAi.arn,
                events: ["s3:ObjectCreated:*"],
            }],
        }, {
            dependsOn: [processDocAi],
        });

        return {
            api: api.url,
            bucket: bucket.name,
            table: table.name,
            docAiTopicArn: docAiTopic.arn,
            isapreTopicArn: isapreTopic.arn,
        };
    },
});
