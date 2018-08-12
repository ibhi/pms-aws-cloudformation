const region = 'ap-south-1';

var AWS = require('aws-sdk');
AWS.config.update({ region: region });

const cloudformation = new AWS.CloudFormation();
const ec2 = new AWS.EC2();

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
    let params = {
        LogicalResourceId: 'SpotFleet', /* required */
        StackName: 'pms' /* required */
    };
    cloudformation.describeStackResource(params).promise()
    .then(data => {
        const spotfleetRequestId = data.StackResourceDetail.PhysicalResourceId;
        return spotfleetRequestId;
    }).then(spotfleetRequestId => {
        const params = {
            SpotFleetRequestId: spotfleetRequestId  /* required */
        };
        return ec2.describeSpotFleetInstances(params).promise().then(data => {
            const instanceId = data.ActiveInstances[0].InstanceId;
            return instanceId;
        });
    }).then(instanceId => {
        const params = {
            Attribute: 'blockDeviceMapping', /* required */
            InstanceId: instanceId, /* required */
        };
        return ec2.describeInstanceAttribute(params).promise();
    }).then(data => {
        console.log('Block Device Mappings ', data);
        const volumeId = data.BlockDeviceMappings[1].Ebs.VolumeId;
        console.log('Volume Id' + volumeId);
        var params = {
            VolumeId: volumeId, /* required */
            Description: 'Snapshot for PMS data volume',
            TagSpecifications: [
              {
                ResourceType: 'snapshot',
                Tags: [
                  {
                    Key: 'Name',
                    Value: 'pms-snapshot-' + Date.now()
                  }
                ]
              },
              /* more items */
            ]
          };
          return ec2.createSnapshot(params).promise();
    }).then(data => {
        console.log(data);
        const now = Date.now();
        const params = {
            Item: {
					SnapshotId: data.SnapshotId,
					VolumeId: data.VolumeId,
					State: data.State,
					StartTime: data.StartTime,
					OwnerId: data.OwnerId,
					VolumeSize: data.VolumeSize,
					Tags: data.Tags,
					Encrypted: data.Encrypted,
					CreatedDate: now,
					CreatedDateString: new Date(now).toLocaleString(),
					RetentionDays: 1
			},
            TableName: 'snaps'
        };
        
        return dynamodb.put(params).promise()
            .then(data => {
                callback(null, data);
            })
            .catch(callback);
    })
    .catch(err => callback(err));

};