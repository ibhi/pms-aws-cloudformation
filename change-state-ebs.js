/* This lambda scans a dynamodb table named `snaps` and for each snapshot entry in the table, 
* it fetches the latest state of the snapshot from AWS and updates the status field of the snapshot in table from `pending`
** to `completed`
*/
const region = 'ap-south-1';

var AWS = require('aws-sdk');
AWS.config.update({ region: region });

const ec2 = new AWS.EC2();

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
    // TODO implement
    const params = {
        TableName: 'snaps',
    };

    dynamodb.scan(params).promise()
        .then(data => {
            // For each snapshot entry present in db
            data.Items.forEach(snapshot => {
                console.log(`Snapshot ${snapshot.SnapshotId} from db`);
                const snapshotId = snapshot.SnapshotId;
                const previousState = snapshot.State;
                const params = {
                    SnapshotIds: [snapshotId]
                };
                // Describe the snapshot using id and get current state of the snapshot
                ec2.describeSnapshots(params).promise()
                    .then(snapshotCurrent => {
                        console.log(`Describe snapshot ${snapshotCurrent.Snapshots[0].SnapshotId}`);
                        const currentState = snapshotCurrent.Snapshots[0].State;
                        // If currentState is 'completed' and previousState is 'pending' then update the snapshot status field in db to 'completed'
                        if (previousState === 'pending' && currentState === 'completed') {
                            var updateparams = {
                                TableName: 'snaps',
                                Key: {
                                    "SnapshotId": snapshotId
                                },
                                UpdateExpression: "SET #estate =:s",
								ExpressionAttributeNames:{
									"#estate": "State"
									
								},
                                ExpressionAttributeValues: {
                                    ":s": currentState
                                },
                                ReturnValues: "UPDATED_NEW"
                            };
                            
                            dynamodb.update(updateparams).promise()
                                .then(data => callback(null, data))
                                .catch(callback);
                        }
                        else {
                            console.log('Nothing to update, Bye:)');
                            callback(null, 'Nothing to update, Bye:)');
                        }
                    })
                    .catch(callback);
            });
        })
        .catch(callback);
};
