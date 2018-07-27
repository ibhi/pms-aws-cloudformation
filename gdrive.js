// Use this code snippet in your app.
// If you need more information about configurations or implementing the sample code, visit the AWS docs:
// https://aws.amazon.com/developers/getting-started/nodejs/

// Load the AWS SDK
var AWS = require('aws-sdk'),
    endpoint = "https://secretsmanager.ap-south-1.amazonaws.com",
    region = "ap-south-1",
    secretName = "gdrive-token",
    secret,
    binarySecretData;
var fs = require('fs');

AWS.config.update({region: region});

// Create a Secrets Manager client
var client = new AWS.SecretsManager({
    endpoint: endpoint,
    region: region
});

var ec2 = new AWS.EC2();

AWS.config.logger = console;

client.getSecretValue({ SecretId: secretName }, function (err, data) {
    console.log("Inside code");
    if (err) {
        if (err.code === 'ResourceNotFoundException')
            console.log("The requested secret " + secretName + " was not found");
        else if (err.code === 'InvalidRequestException')
            console.log("The request was invalid due to: " + err.message);
        else if (err.code === 'InvalidParameterException')
            console.log("The request had invalid params: " + err.message);
    }
    else {
        // Decrypted secret using the associated KMS CMK
        // Depending on whether the secret was a string or binary, one of these fields will be populated
        if (data.SecretString !== "") {
            secret = JSON.parse(data.SecretString);
            var fileContent = `
            [Gdrive]
            type = drive
            client_id = 
            client_secret = 
            scope = drive
            root_folder_id = 
            service_account_file = 
            token = {"access_token":"${secret.access_token}","token_type":"Bearer","refresh_token":"${secret.refresh_token}","expiry":"${secret.expiry}"}

            [Gcache]
            type = cache
            remote = Gdrive:Media
            plex_url = http://localhost:32400
            plex_username = ${secret.plex_username}
            plex_password = ${secret.plex_pwd}
            chunk_size = 10M
            info_age = 48h
            chunk_total_size = 30G
            `
            fs.writeFile('/home/ubuntu/.config/rclone/rclone.conf', fileContent, (err) => {
                if (err) throw err;
                console.log('/home/ubuntu/.config/rclone/rclone.conf file successfully created');
            });
        } else {
            binarySecretData = data.SecretBinary;
        }
    }

    // Your code goes here.
});

console.log(`Allocation Id: ${process.env.ALLOCATION_ID} `);
console.log(`Instance Id: ${process.env.EC2_INSTANCE_ID}`);

var params = {
    AllocationId: process.env.ALLOCATION_ID,
    InstanceId: process.env.EC2_INSTANCE_ID
};
ec2.associateAddress(params, function (err, data) {
    if (err) throw err; // an error occurred
    else console.log('Associated Elastic Ip: ', data);           // successful response
    /*
    data = {
     AssociationId: "eipassoc-2bebb745"
    }
    */
});