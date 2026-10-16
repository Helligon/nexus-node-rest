import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const spec = fileURLToPath(new URL('./openapi.yaml', import.meta.url));
await SwaggerParser.validate(spec);
