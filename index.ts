import cloudform, { Fn, Refs, EC2, StringParameter, ResourceTag, NumberParameter, IAM, Value, Logs, Route53 } from "cloudform";

const USER_DATA: string = `#!/bin/bash -xe
apt-get update
apt-get upgrade -y
apt-get install unzip -y
apt-get install python -y
apt-get install docker.io -y
apt-get install docker-compose -y
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs

# Configure rclone directories
mkdir -p /home/ubuntu/.config/rclone
chown -R ubuntu:ubuntu /home/ubuntu/.config/

# Associate Elastic Ip to this spot instance
export EC2_INSTANCE_ID="\`wget -q -O - http://169.254.169.254/latest/meta-data/instance-id || die \"wget instance-id has failed: $?\"\`"
export ALLOCATION_ID=\${ElasticIp.AllocationId}

cd /tmp
git clone https://github.com/ibhi/pms-aws-cloudformation.git
cd pms-aws-cloudformation
npm install
node gdrive.js
cd ..
cd ..

# Wait for the Elastic IP association to complete
sleep 1m

# Setup logs
cat <<EOF > /tmp/awslogs.conf
[general]
state_file = /var/awslogs/state/agent-state

[/var/log/syslog]
file = /var/log/syslog
log_group_name = \${CloudWatchLogsGroup}
log_stream_name = pms/var/log/syslog
datetime_format = %b %d %H:%M:%S
initial_position = start_of_file

[/var/log/docker]
file = /var/log/docker
log_group_name = \${CloudWatchLogsGroup}
log_stream_name = pms/var/log/docker
datetime_format = %Y-%m-%dT%H:%M:%S.%f
initial_position = start_of_file

[/var/log/cloud-init-output]
file = /var/log/cloud-init-output.log
log_group_name = \${CloudWatchLogsGroup}
log_stream_name = pms/var/log/cloud-init-output
datetime_format = %Y-%m-%dT%H:%M:%S.%f
initial_position = start_of_file

EOF

cd /tmp && curl -sO https://s3.amazonaws.com/aws-cloudwatch/downloads/latest/awslogs-agent-setup.py
python /tmp/awslogs-agent-setup.py -n -r \${AWS::Region} -c /tmp/awslogs.conf

# Setup and mount EBS as cache folder for rclone
fstype=\`file -s /dev/nvme1n1\`
if [ "$fstype" == "/dev/nvme1n1: data" ]
then
mkfs -t ext4 /dev/nvme1n1
fi
mkdir -p /cache
chmod 750 /cache
mount /dev/nvme1n1 /cache
chmod -R 750 /cache
chown -R ubuntu:ubuntu /cache/
echo "/dev/nvme1n1 /cache ext4 defaults,nofail 0 2" >> /etc/fstab

# Install rclone
curl https://rclone.org/install.sh | bash

# Mount rclone
mkdir -p /var/log/rclone
mkdir -p /cache/uploads
mkdir -p /media
chown -R ubuntu:ubuntu /cache/uploads/
chown -R ubuntu:ubuntu /media

cat <<EOF > /etc/systemd/system/rclone.service
[Unit]
Description=Mount and cache Google drive to /media
After=syslog.target local-fs.target network.target
[Service]
Environment=RCLONEHOME=/home/ubuntu/.config/rclone
Environment=MOUNTTO=/media
Environment=LOGS=/var/log/rclone
Environment=UPLOADS=/cache/uploads
Type=simple
User=root
ExecStartPre=/bin/mkdir -p \${MOUNTTO}
ExecStartPre=/bin/mkdir -p \${LOGS}
ExecStartPre=/bin/mkdir -p \${UPLOADS}
ExecStart=/usr/bin/rclone mount \
  --rc \
  --log-file \${LOGS}/rclone.log \
  --log-level INFO \
  --umask 002 \
  --allow-non-empty \
  --allow-other \
  --dir-cache-time=160h \
  --buffer-size=500M \
  --attr-timeout=1s \
  --cache-chunk-size=10M \
  --cache-info-age=168h \
  --cache-workers=5 \
  --cache-tmp-upload-path \${UPLOADS} \
  --cache-tmp-wait-time 60m \
  --config \${RCLONEHOME}/rclone.conf \
  Gcache: \${MOUNTTO}
ExecStop=/bin/fusermount -u -z \${MOUNTTO}
ExecStop=/bin/rmdir \${MOUNTTO}
Restart=always
[Install]
WantedBy=multi-user.target

EOF

systemctl enable rclone.service
systemctl daemon-reload
systemctl start rclone.service

export DATA_DIRECTORY_PATH=/media
export HOST_NAME=ibhi.tk
# Docker containers setup
cd /tmp/pms-aws-cloudformation
docker-compose up
`;

export default cloudform({
    Description: 'AWS Cloudformation template for personal media center on AWS using EC2 Spot',
    Mappings: {
        CidrMappings: {
            PublicSubnet1: {
                CIDR: '10.0.1.0/24'
            },
            PublicSubnet2: {
                CIDR: '10.0.2.0/24'
            },
            VPC: {
                CIDR: '10.0.0.0/16'
            }
        },
        Ubuntu: {
            'ap-south-1': {
                AMI: 'ami-188fba77'
            },
            'eu-west-3': {
                AMI: 'ami-20ee5e5d'
            },
            'eu-west-2': {
                AMI: 'ami-6b3fd60c'
            },
            'eu-west-1': {
                AMI: 'ami-2a7d75c0'
            },
            'ap-northeast-2': {
                AMI: 'ami-467acf28'
            },
            'ap-northeast-1': {
                AMI: 'ami-940cdceb'
            },
            'sa-east-1': {
                AMI: 'ami-8eecc9e2'
            },
            'ca-central-1': {
                AMI: 'ami-db9e1cbf'
            },
            'ap-southeast-1': {
                AMI: 'ami-51a7aa2d'
            },
            'ap-southeast-2': {
                AMI: 'ami-47c21a25'
            },
            'eu-central-1': {
                AMI: 'ami-de8fb135'
            },
            'us-east-1': {
                AMI: 'ami-759bc50a'
            },
            'us-east-2': {
                AMI: 'ami-5e8bb23b'
            },
            'us-west-1': {
                AMI: 'ami-4aa04129'
            },
            'us-west-2': {
                AMI: 'ami-ba602bc2'
            }
        }
    },
    Parameters: {
        SourceCidr: new StringParameter({
            Description: 'Optional - CIDR/IP range for instance ssh access - defaults to 0.0.0.0/0',
            Default: '0.0.0.0/0'
        }),
        KeyName: {
            Description: 'Description: Name of an existing EC2 KeyPair to enable SSH access to the EC2 Instances',
            Type: 'AWS::EC2::KeyPair::KeyName'
        },
        SpotFleetTargetCapacity: new NumberParameter({
            Description: 'Number of EC2 Spot Instances to initially launch in the Spot Fleet',
            Default: 1
        }),
        SpotPrice: new NumberParameter({
            Description: 'Spot Instance Bid Price',
            Default: 0.3
        }),
        DomainName: new StringParameter({
            Description: 'Enter your custom domain name',
            Default: 'ibhi.tk'
        }),
    },
    Outputs: {},
    Resources: {
        VPC: new EC2.VPC({
            CidrBlock: Fn.FindInMap('CidrMappings', 'VPC', 'CIDR'),
            EnableDnsHostnames: true,
            EnableDnsSupport: true,
            Tags: [
                new ResourceTag('Name', 'VPC for Personal Media Server on AWS')
            ]
        }),
        InternetGateway: new EC2.InternetGateway().dependsOn('VPC'),
        AttachGateway: new EC2.VPCGatewayAttachment({
            InternetGatewayId: Fn.Ref('InternetGateway'),
            VpcId: Fn.Ref('VPC')
        }).dependsOn(['VPC', 'InternetGateway']),
        PublicRouteTable: new EC2.RouteTable({
            VpcId: Fn.Ref('VPC'),
            Tags: [
                new ResourceTag('Name', 'Public Route Table')
            ]
        }).dependsOn(['VPC', 'AttachGateway']),
        PublicRoute: new EC2.Route({
            DestinationCidrBlock: '0.0.0.0/0',
            GatewayId: Fn.Ref('InternetGateway'),
            RouteTableId: Fn.Ref('PublicRouteTable')
        }).dependsOn(['InternetGateway', 'PublicRouteTable']),
        PublicSubnet1: new EC2.Subnet({
            AvailabilityZone: Fn.Select(0, Fn.GetAZs(Refs.Region)),
            CidrBlock: Fn.FindInMap('CidrMappings', 'PublicSubnet1', 'CIDR'),
            VpcId: Fn.Ref('VPC'),
            MapPublicIpOnLaunch: true,
            Tags: [
                new ResourceTag('Name', 'Public Subnet 1')
            ]
        }).dependsOn(['VPC']),
        PublicSubnet1RouteTableAssociation: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref('PublicRouteTable'),
            SubnetId: Fn.Ref('PublicSubnet1')
        }).dependsOn(['PublicRouteTable', 'PublicSubnet1']),
        PublicSubnet2: new EC2.Subnet({
            AvailabilityZone: Fn.Select(1, Fn.GetAZs(Refs.Region)),
            CidrBlock: Fn.FindInMap('CidrMappings', 'PublicSubnet2', 'CIDR'),
            VpcId: Fn.Ref('VPC'),
            MapPublicIpOnLaunch: true,
            Tags: [
                new ResourceTag('Name', 'Public Subnet 2')
            ]
        }).dependsOn('VPC'),
        PublicSubnet2RouteTableAssociation: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref('PublicRouteTable'),
            SubnetId: Fn.Ref('PublicSubnet2')
        }).dependsOn(['PublicRouteTable', 'PublicSubnet2']),
        // End of VPC

        // Start of Spot fleet
        SecurityGroup: new EC2.SecurityGroup({
            GroupDescription: 'Media Server Security Group',
            SecurityGroupIngress: [
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 22,
                    ToPort: 22,
                    IpProtocol: 'tcp'
                }),
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 80,
                    ToPort: 80,
                    IpProtocol: 'tcp'
                })
            ],
            VpcId: Fn.Ref('VPC')
        }).dependsOn('VPC'),

        CloudWatchLogsGroup: new Logs.LogGroup({
            RetentionInDays: 7
        }),

        SpotFleetRole: new IAM.Role({
            AssumeRolePolicyDocument: {
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: ['spotfleet.amazonaws.com']
                    },
                    Action: ['sts:AssumeRole']
                }],
                Version: '2012-10-17'
            },
            ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'],
            Path: '/'
        }),

        SpotFleetInstanceRole: createSpotFleetInstanceRole(),

        SpotFleetInstanceProfile: new IAM.InstanceProfile({
            Path: '/',
            Roles: [Fn.Ref('SpotFleetInstanceRole')]
        }).dependsOn('SpotFleetInstanceRole'),

        SpotFleet: new EC2.SpotFleet({
            SpotFleetRequestConfigData: new EC2.SpotFleet.SpotFleetRequestConfigData({
                AllocationStrategy: 'lowestPrice',
                Type: 'maintain',
                IamFleetRole: Fn.GetAtt('SpotFleetRole', 'Arn'),
                SpotPrice: Fn.Ref('SpotPrice'),
                TargetCapacity: Fn.Ref('SpotFleetTargetCapacity'),
                TerminateInstancesWithExpiration: true,
                LaunchSpecifications: [
                    createLaunchSpecification('c5.large'),
                    createLaunchSpecification('m5.large')
                ]
            })
        }).dependsOn([
            'SpotFleetRole', 
            'PublicSubnet1', 
            'PublicSubnet2', 
            'SecurityGroup',
            'ElasticIp'
        ]),

        ElasticIp: new EC2.EIP({
            Domain: 'vpc'
        }),

        HostedZone: new Route53.HostedZone({
            Name: Fn.Ref('DomainName')
        }),

        WildcardRecordSet: new Route53.RecordSet({
            Type: 'A',
            HostedZoneId: Fn.Ref('HostedZone'),
            Name: Fn.Join('.', [ '*', Fn.Ref('DomainName')]),
            TTL: '300',
            ResourceRecords: [
                Fn.Ref('ElasticIp')
            ]
        }).dependsOn(['ElasticIp', 'HostedZone']),

        ProxyRecordSet: new Route53.RecordSet({
            Type: 'A',
            HostedZoneId: Fn.Ref('HostedZone'),
            Name: Fn.Join('.', [ 'proxy', Fn.Ref('DomainName')]),
            TTL: '300',
            ResourceRecords: [
                Fn.Ref('ElasticIp')
            ]
        }).dependsOn(['ElasticIp', 'HostedZone'])
    }
});

function createLaunchSpecification(instanceType: Value<string>) {
    var allocationId = Fn.GetAtt('ElasticIp', 'AllocationId');
    return new EC2.SpotFleet.SpotFleetLaunchSpecification({
        IamInstanceProfile: new EC2.SpotFleet.IamInstanceProfileSpecification({
            Arn: Fn.GetAtt('SpotFleetInstanceProfile', 'Arn')
        }),
        ImageId: Fn.FindInMap('Ubuntu', Refs.Region, 'AMI'),
        InstanceType: instanceType,
        KeyName: Fn.Ref('KeyName'),
        Monitoring: new EC2.SpotFleet.SpotFleetMonitoring({
            Enabled: true
        }),
        SecurityGroups: [new EC2.SpotFleet.GroupIdentifier({ GroupId: Fn.Ref('SecurityGroup') })],
        SubnetId: Fn.Join(',', [Fn.Ref('PublicSubnet1'), Fn.Ref('PublicSubnet2')]),
        BlockDeviceMappings: [
            new EC2.SpotFleet.BlockDeviceMapping({
                DeviceName: '/dev/sdk',
                Ebs: new EC2.SpotFleet.EbsBlockDevice({
                    VolumeSize: 40,
                    VolumeType: 'gp2',
                    DeleteOnTermination: true
                })
            })
        ],
        UserData: Fn.Base64(Fn.Sub(
            USER_DATA, 
            {
                'RCLONEHOME': '/home/ubuntu/.config/rclone',
                'MOUNTTO': '/media',
                'LOGS': '/var/log/rclone',
                'UPLOADS': '/cache/uploads',
                // 'ALLOCATIONID': Fn.GetAtt('ElasticIp', 'AllocationId')
            }
        ))
    })
}

function createSpotFleetInstanceRole() {
    return {
        Properties: {
            AssumeRolePolicyDocument: {
                'Statement': [{
                    Effect: 'Allow',
                    Principal: {
                        Service: ['ec2.amazonaws.com']
                    },
                    Action: ['sts:AssumeRole']
                }],
                Version: '2012-10-17'
            },
            ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'],
            Path: '/',
            Policies: [
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                "logs:CreateLogGroup",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                                "logs:DescribeLogStreams"
                            ],
                            Resource: ['arn:aws:logs:*:*:*']
                        }]
                    },
                    PolicyName: 'CloudWatchLogsPolicy'
                },
                {
                    PolicyDocument: {
                        Version : '2012-10-17',
                        Statement : [
                            {
                                Effect: 'Allow',
                                Action: 'secretsmanager:GetSecretValue',
                                Resource: 'arn:aws:secretsmanager:ap-south-1:782677160809:secret:gdrive-token-EFr0g3'
                            }
                        ]
                    },
                    PolicyName: 'SecretsManagerPolicy'
                },
                {
                    PolicyDocument: {
                        Version : '2012-10-17',
                        Statement : [
                            {
                                Effect: 'Allow',
                                Action: [
                                    "ec2:DescribeAddresses",
                                    "ec2:AllocateAddress",
                                    "ec2:DescribeInstances",
                                    "ec2:AssociateAddress"
                                ],
                                Resource: '*'
                            }
                        ]
                    },
                    PolicyName: 'AssociateElasticIpAddress'
                }
            ]
        },
        Type: 'AWS::IAM::Role'

    }
}
