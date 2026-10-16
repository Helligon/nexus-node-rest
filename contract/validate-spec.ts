import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const specPath = fileURLToPath(new URL('./openapi.yaml', import.meta.url));
await SwaggerParser.validate(specPath);
