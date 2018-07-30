const region = "ap-south-1";

var AWS = require('aws-sdk');
AWS.config.update({ region: region });

const cloudformation = new AWS.cloudformation();

exports.handler = (event, context, callback) => {
    const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });
    const params = {
        StackName: 'pms', /* required */
        Capabilities: [
            'CAPABILITY_NAMED_IAM'
        ],
        // ClientRequestToken: 'STRING_VALUE',
        // DisableRollback: true || false,
        // EnableTerminationProtection: true || false,
        // NotificationARNs: [
        //     'STRING_VALUE',
        //     /* more items */
        // ],
        // OnFailure: DO_NOTHING | ROLLBACK | DELETE,
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
                ParameterKey: 'SpotPrice',
                ParameterValue: '0.1'
            },
            {
                ParameterKey: 'DomainName',
                ParameterValue: 'ibhi.tk'
            },
            {
                ParameterKey: 'CacheSnapshotId',
                ParameterValue: 'snap-01f85e7c0b6f9b82f'
            },
            {
                ParameterKey: 'GDriveSecret',
                ParameterValue: 'arn:aws:secretsmanager:ap-south-1:782677160809:secret:gdrive-token-EFr0g3'
            }
            /* more items */
        ],
        ResourceTypes: [
            'AWS::*',
            /* more items */
        ],
        RoleARN: 'arn:aws:iam::782677160809:role/pms-cloudformation-role1',
        // RollbackConfiguration: {
        //     MonitoringTimeInMinutes: 0,
        //     RollbackTriggers: [
        //         {
        //             Arn: 'STRING_VALUE', /* required */
        //             Type: 'STRING_VALUE' /* required */
        //         },
        //         /* more items */
        //     ]
        // },
        // StackPolicyBody: 'STRING_VALUE',
        // StackPolicyURL: 'STRING_VALUE',
        Tags: [
            {
                Key: 'Name', /* required */
                Value: 'pms' /* required */
            },
            /* more items */
        ],
        // TemplateBody: 'STRING_VALUE',
        TemplateURL: 'https://s3.ap-south-1.amazonaws.com/cf-templates-1g7z2nh3wiuu3-ap-south-1/2018211xcZ-pms.json',
        // TimeoutInMinutes: 0
    };

    cloudformation.createStack(params, (err, data) => {
        if (err) {
            console.log(err, err.stack); // an error occurred
            callback(err);
        } else {
            console.log(data);           // successful response
            callback(null, data);
        }
    });

};