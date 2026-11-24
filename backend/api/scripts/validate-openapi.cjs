// Validates openapi/openapi.json against the OpenAPI 3.0 schema and resolves every $ref.
const SwaggerParser = require('@apidevtools/swagger-parser');
const path = require('node:path');

SwaggerParser.validate(path.join(__dirname, '..', 'openapi', 'openapi.json'))
  .then((api) => {
    const ops = Object.values(api.paths).reduce((n, item) => n + Object.keys(item).length, 0);
    console.log(`OpenAPI valid: ${Object.keys(api.paths).length} paths, ${ops} operations`);
  })
  .catch((err) => {
    console.error('OpenAPI INVALID:', err.message);
    process.exit(1);
  });
