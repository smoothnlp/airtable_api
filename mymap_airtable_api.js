/**
 * Creates a map image based on a template and prompt, and stores the resulting image URL in an Airtable record.
 * 
 * This function takes a template and a prompt from specified input columns, sends them to an external API
 * that generates a map image, and then stores the resulting image URL in a specified output column of an Airtable record.
 * The API request has a timeout of 120 seconds.
 * 
 * @param {string} tpl_column - The name of the column containing the template value.
 * @param {string} prompt_column - The name of the column containing the prompt value.
 * @param {string} output_column - The name of the column where the generated map image URL will be stored.
 * @param {string} record_id - The ID of the record being processed.
 * @param {string} table_id - The ID of the table containing the record.
 * @param {string} base_id - The ID of the Airtable base.
 * 
 * @throws {Error} Throws an error if no template or prompt is found in the input columns, if the API call fails, or if the request times out.
 * 
 * @returns {Promise<void>} This function doesn't return a value, but updates the specified record in Airtable.
 */
async function create_map_image(tpl_column, prompt_column, output_column, record_id, table_id, base_id) {
    const CREATE_MAP_API_ENDPOINT = 'https://jobs.mymap.ai/jobs/new_map_image/run';
    const TIMEOUT = 120000; // 120 seconds in milliseconds

    // Get the table and record
    let table = base.getTable(table_id);
    let record = await table.selectRecordsAsync({ recordIds: [record_id] });
    record = record.records[0];

    // Get the template and prompt from the input columns
    let tpl = record.getCellValue(tpl_column);
    let prompt = record.getCellValue(prompt_column);

    if (!tpl || !prompt) {
        console.log(`Missing template or prompt. Template: ${tpl}, Prompt: ${prompt}`);
        throw new Error("Missing template or prompt");
    }
    
    try {
        // Create a promise that rejects in <TIMEOUT> milliseconds
        const timeoutPromise = new Promise((_, reject) => {
            const id = setTimeout(() => {
                clearTimeout(id);
                reject(new Error(`Request timed out after ${TIMEOUT/1000} seconds`));
            }, TIMEOUT);
        });

        // Call the Create Map API with a timeout
        const fetchPromise = fetch(CREATE_MAP_API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                base_id: base_id,
                table_id: table_id,
                record_id: record_id,
                output_column: output_column,
                visuals: [
                    {
                        tpl: tpl,
                        prompt: prompt
                    }
                ]
            })
        });

        // Race the fetch promise against the timeout promise
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        console.log("Map image successfully created and URL stored");
    } catch (error) {
        console.error("Error in map image creation:", error);
        throw error;
    }
}