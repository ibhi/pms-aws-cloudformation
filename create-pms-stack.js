const region = 'ap-south-1';
var AWS = require('aws-sdk');
AWS.config.update({ region: region });
const cloudformation = new AWS.CloudFormation();
const dynamodb = new AWS.DynamoDB.DocumentClient();
exports.handler = (event, context, callback) => {
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    switch (event.httpMethod) {
        case 'DELETE':
            console.log('Delete called');
            deleteStack(done);
            break;
        case 'GET':
            console.log('Get called');
            break;
        case 'POST':
            console.log('Post called');
            createStack(done);
            break;
        default:
            done(new Error('Unsupported method ' + event.httpMethod));
    }
};
function createStack(callback) {
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
            let snapshotId;
            if (data.Items.length === 1) {
                snapshotId = data.Items[0].SnapshotId;
            } else {
                const snapshots = data.Items.sort((snapshot1, snapshot2) => {
                   if(snapshot1.CreatedDate < snapshot2.CreatedDate)  {
                       return -1;
                   }
                   if(snapshot1.CreatedDate > snapshot2.CreatedDate) {
                       return 1;
                   }
                   return 0;
                });
                snapshotId = snapshots[snapshots.length - 1].SnapshotId;
            }
            const params = {
                StackName: 'pms',
                Capabilities: [
                    'CAPABILITY_NAMED_IAM'
                ],
                Parameters: [
                    {
                        ParameterKey: 'NetworkStackName',
                        ParameterValue: 'pms-vpc'
                    },
                    {
                        ParameterKey: 'SourceCidr',
                        ParameterValue: '0.0.0.0/0'
                    },
                    {
                        ParameterKey: 'KeyName',
                        ParameterValue: 'personal-media-server'
                    },
                    {
                        ParameterKey: 'DomainName',
                        ParameterValue: 'ibhi.tk'
                    },
                    {
                        ParameterKey: 'CacheSnapshotId',
                        ParameterValue: snapshotId
                    },
                    {
                        ParameterKey: 'GDriveSecret',
                        ParameterValue: 'arn:aws:secretsmanager:ap-south-1:782677160809:secret:gdrive-token-EFr0g3'
                    }
                ],
                RoleARN: '\${PMSCloudFormationStackCreationRoleArn}',
                Tags: [
                    {
                        Key: 'Name',
                        Value: 'pms'
                    }
                ],
                TemplateURL: 'https://s3.ap-south-1.amazonaws.com/cf-templates-1g7z2nh3wiuu3-ap-south-1/pms.json',
            };
            cloudformation.createStack(params, callback);
        }).catch(callback);
}
function deleteStack(callback) {
    const params = {
        StackName: 'pms',
        RoleARN: '\${PMSCloudFormationStackCreationRoleArn}'
    };
    cloudformation.deleteStack(params, callback);
}