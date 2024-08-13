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
- Do not translate the "slug" key
- The input is JSON. The values in keys such as "What_is", "Why_use", "How_to_use", "meta" are already DOM. Make sure you only translate the values in the HTML tag.
- Translate values in all JSON keys.
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
                    "user_msg": user_msg
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
