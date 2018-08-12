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
        FilterExpression: '#cDate < :now',
        ExpressionAttributeNames: {
            '#cDate': 'CreatedDate'
        },
        ExpressionAttributeValues: {
            ':now': Date.now()
        }
    };

    dynamodb.scan(params).promise()
        .then(data => {
            // if only one snapshot is available in database then do not delete it, simply quit
            if (data.Items.length === 1) {
                return callback(null, 'Only one snapshot is available, so not deleting it');
            }
            // For each snapshot entry present in db
            
            // Workaround: manually sorting the items, because in DynamoDB scan, you cannot sort results
            const snapshots = data.Items.sort((snapshot1, snapshot2) => {
               if(snapshot1.CreatedDate < snapshot2.CreatedDate)  {
                   return -1;
               }
               if(snapshot1.CreatedDate > snapshot2.CreatedDate) {
                   return 1;
               }
               return 0;
            });
            
            snapshots.forEach((snapshot, index) => {
                console.log(`Snapshot ${snapshot.SnapshotId}, CreatedDate: ${snapshot.CreatedDateString}  from db`);
                // Do not delete the last snapshot, simply quit
                if(index === (data.Items.length -1) ) {
                    return callback(null, 'This is the last snapshot available, so not deleting it');
                }
                
                const createdDate = snapshot.CreatedDate;

                const today = Date.now();

                const differenceInSeconds = today - createdDate;

                const differenceInDays = differenceInSeconds / 86400000;

                const numberOfDays = Math.round(differenceInDays);


                const snapshotId = snapshot.SnapshotId; //snapshotId holds the DynamoDb table "Snaps" primary key or HashId
                const snapshotLifeTime = snapshot.day;

                if (0 <= numberOfDays && snapshot.State === 'completed') {
                    const params = {
                        SnapshotId: snapshotId
                    };

                    ec2.deleteSnapshot(params).promise()
                        .then(data => {
                            console.log(`Deleted ${snapshotId}, createdAt: ${snapshot.CreatedDateString}`);
                            const params = {
                                TableName: 'snaps',
                                Key: {
                                    SnapshotId: snapshotId,
                                    CreatedDate: createdDate
                                }
                            };
                            
                            dynamodb.delete(params).promise()
                                .then(data => callback(null, data))
                                .catch(callback);
                            
                        })
                        .catch(callback);
                }
            });
        })
        .catch(callback);
};
