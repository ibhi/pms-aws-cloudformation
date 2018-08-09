const region = 'ap-south-1';

var AWS = require('aws-sdk');
AWS.config.update({ region: region });

const cloudformation = new AWS.CloudFormation();
const ec2 = new AWS.EC2();

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
        return ec2.describeInstanceAttribute(params).promise().then(data => {
            return data;
        });
    }).then(data => {
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
                    Value: `pms-snapshot-${Date.now()}`
                  }
                ]
              },
              /* more items */
            ]
          };
          return ec2.createSnapshot(params).promise().then(data => data);
    }).then(data => {
        callback(null, data);
    })
    .catch(err => callback(err));

};