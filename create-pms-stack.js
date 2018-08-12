const region = 'ap-south-1';

var AWS = require('aws-sdk');
AWS.config.update({ region: region });

const cloudformation = new AWS.CloudFormation();

exports.handler = (event, context, callback) => {
    console.log('Event', event);
    
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
        // case 'PUT':
        //     dynamo.updateItem(JSON.parse(event.body), done);
        //     break;
        default:
            done(new Error('Unsupported method ' + event.httpMethod));
    }

};

function createStack(callback) {
    const params = {
        StackName: 'pms', /* required */
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
                ParameterValue: 'snap-08b17b5c98f1138d3'
            },
            {
                ParameterKey: 'GDriveSecret',
                ParameterValue: 'arn:aws:secretsmanager:ap-south-1:782677160809:secret:gdrive-token-EFr0g3'
            }
            /* more items */
        ],
        RoleARN: '\${PMSCloudFormationStackCreationRoleArn}',
        Tags: [
            {
                Key: 'Name', /* required */
                Value: 'pms' /* required */
            },
            /* more items */
        ],
        TemplateURL: 'https://s3.ap-south-1.amazonaws.com/cf-templates-1g7z2nh3wiuu3-ap-south-1/pms.json',
    };
    cloudformation.createStack(params, callback);
}

function deleteStack(callback) {
    const params = {
        // Todo: make it dynamic
        StackName: 'pms',
        RoleARN: '\${PMSCloudFormationStackCreationRoleArn}'
    };
    cloudformation.deleteStack(params, callback);
}