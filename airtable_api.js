/**
 * Generates AI content based on input columns and a system prompt, then writes the response to an output column.
 * The user message is wrapped in XML tags using column names as tags.
 * 
 * @param {string[]} input_columns - Array of column names to use as input for the AI.
 * @param {string} system_prompt_name - Name of the system prompt to retrieve from the "Prompts" table.
 * @param {string} output_column - Name of the column where the AI-generated content will be stored.
 * @param {string} record_id - The ID of the record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * @param {string} [model="gpt-4o"] - The AI model to use for generation.
 * @param {boolean} [openai_json_format=false] - Whether to use OpenAI's JSON format for the response.
 * 
 * @throws {Error} Throws an error if the system prompt cannot be retrieved.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified record in Airtable.
 */
async function ai_generate(input_columns, system_prompt_name, output_column, record_id, table_id, base_id, model = "gpt-4o", openai_json_format = false) {
    const AI_API_ENDPOINT = 'https://jobs.mymap.ai/job/ai2col/run';
    const PROMPTS_TABLE_NAME = 'Prompts';

    // Function to get system prompt from the Prompts table
    async function getSystemPrompt(promptName) {
        const promptsTable = base.getTable(PROMPTS_TABLE_NAME);
        const query = await promptsTable.selectRecordsAsync({
            fields: ['Name', 'Prompt']
        });

        const matchingRecords = query.records.filter(record => 
            record.getCellValueAsString("Name") === promptName
        );

        if (matchingRecords.length > 0) {
            return matchingRecords[0].getCellValue("Prompt");
        } else {
            console.log(`No prompt found with the name: ${promptName}`);
            return null;
        }
    }

    // Get the system prompt
    let system_prompt = await getSystemPrompt(system_prompt_name);
    if (!system_prompt) {
        throw new Error(`Failed to retrieve system prompt: ${system_prompt_name}`);
    }

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordAsync(record_id);

    // Prepare the user message from input columns, wrapped in XML tags
    let user_msg = input_columns.map(column => {
        return `<${column}>${record.getCellValueAsString(column)}</${column}>`;
    }).join("\n");

    console.log(`Generating content for '${output_column}' column`);

    // Call the AI API
    await fetch(AI_API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
            base_id: base_id,
            table_id: table_id,
            record_id: record_id,
            output_column: output_column,
            model: model,
            system_prompt: system_prompt,
            user_msg: user_msg,
            openai_json_format: openai_json_format
        })
    });

    console.log(`Content generation completed for '${output_column}' column`);
}



/**
 * Translates a JSON column into multiple language columns.
 * 
 * @param {string} input_json_column - The name of the column containing the input JSON.
 * @param {Array<{column: string, name: string}>} languages - Array of language objects with column name and full name.
 * @param {string} record_id - The ID of the record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * @param {string} [model="gpt-4o"] - The AI model to use for translation.
 * 
 * @throws {Error} Throws an error if the translation fails for any language.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified record in Airtable.
 */
async function translate_i18n(input_json_column, languages, record_id, table_id, base_id, model = "gpt-4o") {
    const AI_API_ENDPOINT = 'https://jobs.mymap.ai/jobs/ai2col/run';

    // Function to get the system prompt for a specific language
    function getSystemPrompt(languageName) {
        return `
I am an SEO writing master in ${languageName}. I am here to translate a page content into ${languageName}. Make sure you read the entire content first, not just translate sentence by sentence. Write like native speakers.

Guideline
- The input is in json format. Translate values in all JSON keys. Do not change the keys
- Do not translate the "slug" key & value
- If the value for translation is html dom format, keep the html tags as original, only translate the content
- Output the JSON only, no extra message or code block.
- Maintain SEO best practices and adapt content appropriately for a ${languageName}-speaking audience.
- keep original json key name, do not change key names in your output!
        `;
    }

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordAsync(record_id);

    // Get the input JSON
    let input_json = record.getCellValue(input_json_column);
    let user_msg = JSON.stringify(input_json);

    // Function to translate to a specific language
    async function translateToLanguage(language) {
        console.log(`Translating to ${language.name}`);
        try {
            let response = await fetch(AI_API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify({
                    "base_id": base_id,
                    "table_id": table_id,
                    "record_id": record_id,
                    "output_column": language.column,
                    "model": model,
                    "system_prompt": getSystemPrompt(language.name),
                    "user_msg": user_msg,
                    "openai_json_format": true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log(`Translation completed for ${language.name}`);
        } catch (error) {
            console.error(`Translation failed for ${language.name}:`, error);
            throw error;
        }
    }

    // Translate to all specified languages
    for (let language of languages) {
        await translateToLanguage(language);
    }

    console.log("All translations completed");
}


/**
 * Performs a Google search based on a value in an input column and stores the result in an output column.
 * 
 * This function retrieves a keyword from a specified input column in an Airtable record,
 * uses it to perform a Google search via an external API, and then stores the search 
 * results in a specified output column of the same record.
 * 
 * @param {string} input_column - The name of the column containing the search keywords.
 * @param {string} output_column - The name of the column where the search results will be stored.
 * @param {string} record_id - The ID of the record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * 
 * @throws {Error} Throws an error if no keywords are found in the input column.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified record in Airtable.
 */
async function google_search(input_column, output_column, record_id, table_id, base_id) {
    const SEARCH_API_ENDPOINT = 'https://jobs.mymap.ai/job/keywords_search/run';

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordAsync(record_id);

    // Get the keywords from the input column
    let keywords = record.getCellValueAsString(input_column);

    if (!keywords) {
        console.log(`No value found in the '${input_column}' column.`);
        throw new Error("No keywords found");
    }

    console.log("Searching for keyword:", keywords);

    // Call the Google Search API
    await fetch(SEARCH_API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
            base_id: base_id,
            table_id: table_id,
            record_id: record_id,
            output_column: output_column,
            keywords: keywords
        })
    });

    console.log("Search completed for keyword:", keywords);
}


/**
 * Crawls content from a specified URL and stores it in a designated output column of an Airtable record.
 * 
 * This function takes a URL, sends it to an external API that crawls and processes the content,
 * and then stores the resulting text in a specified output column of an Airtable record.
 * 
 * @param {string} input_column - The name of the column containing the input URL.
 * @param {string} output_column - The name of the column where the crawled content will be stored.
 * @param {string} record_id - The ID of the record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * 
 * @throws {Error} Throws an error if no URL is found in the input column or if the API call fails.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified record in Airtable.
 */
async function crawl_url_content(input_column, output_column, record_id, table_id, base_id) {
    const CRAWL_URL_API_ENDPOINT = 'https://jobs.mymap.ai/job/url2text/run';

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordsAsync({ recordIds: [record_id] });
    record = record.records[0];

    // Get the URL from the input column
    let url = record.getCellValue(input_column);

    if (!url) {
        console.log(`No URL found in the '${input_column}' column.`);
        throw new Error("No URL found");
    }

    console.log("Crawling content from URL:", url);

    try {
        // Call the Crawl URL API
        let response = await fetch(CRAWL_URL_API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                base_id: base_id,
                table_id: table_id,
                record_id: record_id,
                output_column: output_column,
                url: url
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        console.log("Content successfully crawled and stored for URL:", url);
    } catch (error) {
        console.error("Error in URL content crawling:", error);
        throw error;
    }
}





/**
 * Syncs data from an Airtable record to a WordPress post.
 * 
 * This function takes data from specified columns in an Airtable record,
 * formats it for WordPress, and then sends it to a WordPress site via an API.
 * It can create a new post or update an existing one. If the post ID column
 * doesn't exist, it will be created.
 * 
 * @param {string} lang - The language code for the post (e.g., "en" for English). Also used as the column name for content.
 * @param {string} author_id_column - The name of the column containing the author ID.
 * @param {string} record_id - The ID of the Airtable record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * 
 * @throws {Error} Throws an error if the API call fails or if required data is missing.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified WordPress post and Airtable record.
 */
async function sync_to_wordpress(lang, author_id_column, record_id, table_id, base_id) {
    const API_ENDPOINT = 'https://jobs.mymap.ai/job/wp_post_mymap/run';

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordAsync(record_id);

    // Dynamically determine the post ID column name based on the language
    const post_id_column = `post_id_${lang}`;

    // Check if the post ID column exists, if not, create it
    let tableConfig = await table.getConfigAsync();
    if (!tableConfig.columns.some(column => column.name === post_id_column)) {
        console.log(`Column '${post_id_column}' does not exist. Creating it now.`);
        try {
            await table.createFieldAsync(post_id_column, 'number');
            console.log(`Column '${post_id_column}' created successfully.`);
            // Refresh the record to include the new field
            record = await table.selectRecordAsync(record_id);
        } catch (error) {
            console.error(`Failed to create column '${post_id_column}':`, error);
            throw error;
        }
    }

    const post_id = record.getCellValue(post_id_column);

    let post_data = record.getCellValue(lang);
    const post_id_en = record.getCellValue("post_id_en");  // Hard-coded retrieval of post_id_en

    // Get the author ID from the specified column
    let author_id = record.getCellValue(author_id_column);

    if (!post_data) {
        console.log(`No content found in the '${lang}' column.`);
        throw new Error("No content found");
    }

    if (!author_id) {
        console.log(`No author ID found in the '${author_id_column}' column.`);
        throw new Error("No author ID found");
    }

    // Parse the post data
    post_data = JSON.parse(post_data);

    // Log all keys in post_data
    console.log("Keys in post_data:", Object.keys(post_data));

    // Prepare the data for the API call
    const postData = {
        post: {
            ...post_data,
            id: post_id || null,
            status: 'publish',
            author: author_id,
            categories: [],
            tags: [],
            meta: {},
        },
        post_en_id: post_id_en, // Used for linking multi-language posts
        post_lang: lang,
        base_id: base_id,
        table_id: table_id,
        record_id: record_id,
        post_id_column: post_id_column
    };

    console.log(`Syncing ${lang} content to WordPress. Post ID: ${post_id || 'New Post'}, Author ID: ${author_id}`);

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        console.log(`WordPress sync completed for ${lang} content. Post ID: ${post_id || 'New Post'}`);
    } catch (error) {
        console.error("Error in WordPress sync:", error);
        throw error;
    }
}
