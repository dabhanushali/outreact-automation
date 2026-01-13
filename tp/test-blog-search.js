import { GoogleSearch } from "./src/services/GoogleSearch.js";

async function testBlogSearch() {
  console.log("Testing blog search functionality...");

  try {
    // Test a simple query first
    console.log("\n1. Testing simple query: 'site:wordpress.com guest post'");
    const simpleResults = await GoogleSearch.search('site:wordpress.com guest post', 5);
    console.log(`   Found ${simpleResults.length} results:`);
    simpleResults.forEach((r, i) => console.log(`   ${i+1}. ${r.title} - ${r.link}`));

    // Test the actual blog query
    console.log("\n2. Testing blog query: 'blog \"create a learning management system\" \"write for us\"'");
    const blogResults = await GoogleSearch.search('blog "create a learning management system" "write for us"', 5);
    console.log(`   Found ${blogResults.length} results:`);
    blogResults.forEach((r, i) => console.log(`   ${i+1}. ${r.title} - ${r.link}`));

    // Test with different approach
    console.log("\n3. Testing alternative query: '\"create a learning management system\" \"write for us\"'");
    const altResults = await GoogleSearch.search('"create a learning management system" "write for us"', 5);
    console.log(`   Found ${altResults.length} results:`);
    altResults.forEach((r, i) => console.log(`   ${i+1}. ${r.title} - ${r.link}`));

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await GoogleSearch.close();
  }
}

testBlogSearch();
