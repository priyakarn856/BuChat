const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const APP_TABLE = process.env.APP_TABLE;

exports.handler = async (event) => {
  const path = event.path;

  try {
    if (path === '/sitemap-posts.xml') {
      const posts = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'POST' },
        Limit: 1000
      }));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${posts.Items.map(post => `  <url>
    <loc>https://buchat.me/post/${post.postId}</loc>
    <lastmod>${new Date(post.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
</urlset>`;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      };
    }

    if (path === '/sitemap-groups.xml') {
      const groups = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'GROUP' },
        Limit: 1000
      }));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${groups.Items.map(group => `  <url>
    <loc>https://buchat.me/g/${group.groupName}</loc>
    <lastmod>${new Date(group.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>`;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      };
    }

    return { statusCode: 404, body: 'Not Found' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Error generating sitemap' };
  }
};
