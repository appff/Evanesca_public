// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

import { argv } from "process";

async function executeQuery(inpath: string, outpath: string) {

  if (inpath == undefined || outpath == undefined){
    console.error("You should specify input file and out path");
    process.exit(1);
  }

  // [START bigquery_query_pagination]
  // Import the Google Cloud client library using default credentials
  const {BigQuery} = require('@google-cloud/bigquery');
  const bigquery = new BigQuery();

  const fs = require('fs');
  const query = fs.readFileSync(inpath, 'utf8');

  async function queryPagination() {
    // Run the query as a job.
    const [job] = await bigquery.createQueryJob(query);
    
    // Wait for job to complete and get rows.
    const [rows] = await job.getQueryResults();

    console.log('Writing transaction hash list.');
    
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      if (i + 1 == rows.length)
        fs.appendFileSync(outpath, `${row.transaction_hash}`);
      else 
        fs.appendFileSync(outpath, `${row.transaction_hash},`);
    }
  }
  await queryPagination();
  // [END bigquery_query_pagination]
}
executeQuery(argv[2], argv[3]);
