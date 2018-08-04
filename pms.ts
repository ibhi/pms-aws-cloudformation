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
git checkout feature/encrypt-gdrive
npm install
node gdrive.js
cd ..
cd ..

cat <<EOF > /etc/fuse.conf
# /etc/fuse.conf - Configuration file for Filesystem in Userspace (FUSE)

# Set the maximum number of FUSE mounts allowed to non-root users.
# The default is 1000.
#mount_max = 1000

# Allow non-root users to specify the allow_other or allow_root mount options.
user_allow_other
EOF

# Wait for the Elastic IP association to complete
sleep 15s

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
mkdir -p /cache/data/Downloads
mkdir -p /cache/rclone
mkdir -p /media
chown -R ubuntu:ubuntu /var/log/rclone
chown -R ubuntu:ubuntu /cache/data/Downloads
chown -R ubuntu:ubuntu /cache/rclone
chown -R ubuntu:ubuntu /media

cat <<EOF > /etc/systemd/system/rclone.service
[Unit]
Description=Mount and cache Google drive to /media
After=syslog.target local-fs.target network.target
[Service]
Environment=RCLONEHOME=/home/ubuntu/.config/rclone
Environment=MOUNTTO=/media
Environment=LOGS=/var/log/rclone
Type=simple
User=root
ExecStartPre=/bin/mkdir -p \${MOUNTTO}
ExecStartPre=/bin/mkdir -p \${LOGS}
ExecStart=/usr/bin/rclone mount \
    --rc \
    --log-file /var/log/rclone/rclone.log \
    --log-level INFO \
    --umask 002 \
    --allow-other \
    --allow-non-empty \
    --vfs-cache-mode full \
    --dir-cache-time=96h  \
    --buffer-size=500M \
    --vfs-cache-max-age 48h \
    --vfs-read-chunk-size 200M \
    --vfs-read-chunk-size-limit 1G  \
    --cache-dir=/cache/rclone  \
    --config /home/ubuntu/.config/rclone/rclone.conf \
    Gcrypt: \${MOUNTTO}
ExecStop=/bin/fusermount -u -z \${MOUNTTO}
ExecStop=/bin/rmdir \${MOUNTTO}
Restart=always
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target

EOF

systemctl enable rclone.service
systemctl daemon-reload
systemctl start rclone.service

# Docker compose
export DATA_DIRECTORY_PATH=/media
export CONFIG_DIRECTORY_PATH=/media/config
export DOWNLOADS_DIRECTORY_PATH=/cache/data/Downloads
export HOST_NAME=ibhi.tk

mkdir -p /cache/data/letsencrypt
chown -R ubuntu:ubuntu /cache/data/letsencrypt
touch /cache/data/letsencrypt/acme.json
chown ubuntu:ubuntu /cache/data/letsencrypt/acme.json
chmod 600 /cache/data/letsencrypt/acme.json

mkdir -p $CONFIG_DIRECTORY_PATH/plex
mkdir -p $CONFIG_DIRECTORY_PATH/nzbget
mkdir -p $CONFIG_DIRECTORY_PATH/sonarr
mkdir -p $CONFIG_DIRECTORY_PATH/radarr
mkdir -p $CONFIG_DIRECTORY_PATH/plexpy
mkdir -p $CONFIG_DIRECTORY_PATH/organizr
mkdir -p $CONFIG_DIRECTORY_PATH/portainer_data
chown -R ubuntu:ubuntu $CONFIG_DIRECTORY_PATH

mkdir -p $DATA_DIRECTORY_PATH/Movies
mkdir -p $DATA_DIRECTORY_PATH/TV
mkdir -p $DATA_DIRECTORY_PATH/Music
mkdir -p $DATA_DIRECTORY_PATH/Photos
chown -R ubuntu:ubuntu $DATA_DIRECTORY_PATH

# Docker containers setup
cd /tmp/pms-aws-cloudformation
docker network create web
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
        NetworkStackName: new StringParameter({
            Description: "Name of an active CloudFormation stack that contains the networking resources, such as the subnet and security group, that will be used in this stack.",
            MinLength: 1,
            MaxLength: 255,
            // AllowedPattern: "^[a-zA-Z][-a-zA-Z0-9]*$",
            Default: 'pms-vpc'
        }),
        SourceCidr: new StringParameter({
            Description: 'Optional - CIDR/IP range for instance ssh access - defaults to 0.0.0.0/0',
            Default: '0.0.0.0/0'
        }),
        KeyName: {
            Description: 'Description: Name of an existing EC2 KeyPair to enable SSH access to the EC2 Instances',
            Type: 'AWS::EC2::KeyPair::KeyName'
        },
        SpotPrice: new NumberParameter({
            Description: 'Spot Instance Bid Price',
            Default: 0.1
        }),
        DomainName: new StringParameter({
            Description: 'Enter your custom domain name',
            Default: 'ibhi.tk'
        }),
        CacheSnapshotId: new StringParameter({
            Description: 'Enter your cache snapshot id to restore',
            Default: 'snap-01f85e7c0b6f9b82f'
        }),
        GDriveSecret: new StringParameter({
            Description: 'Enter GDrive Secret Id from AWS Secrets Manager',
            Default: 'arn:aws:secretsmanager:ap-south-1:782677160809:secret:gdrive-token-EFr0g3'
        })
    },
    Outputs: {},
    Resources: {

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
                TargetCapacity: 1,
                TerminateInstancesWithExpiration: true,
                LaunchSpecifications: [
                    createLaunchSpecification('c5.large'),
                    createLaunchSpecification('m5.large')
                ]
            })
        }).dependsOn([
            'SpotFleetRole', 
            'ElasticIp'
        ]),

        ElasticIp: new EC2.EIP({
            Domain: 'vpc'
        }),

        WildcardRecordSet: new Route53.RecordSet({
            Type: 'A',
            HostedZoneId: Fn.ImportValue(Fn.Sub('${NetworkStackName}-HostedZone', {})),
            Name: Fn.Join('.', [ '*', Fn.Ref('DomainName')]),
            TTL: '300',
            ResourceRecords: [
                Fn.Ref('ElasticIp')
            ]
        }).dependsOn(['ElasticIp']),

        ProxyRecordSet: new Route53.RecordSet({
            Type: 'A',
            HostedZoneId: Fn.ImportValue(Fn.Sub('${NetworkStackName}-HostedZone', {})),
            Name: Fn.Join('.', [ 'proxy', Fn.Ref('DomainName')]),
            TTL: '300',
            ResourceRecords: [
                Fn.Ref('ElasticIp')
            ]
        }).dependsOn(['ElasticIp'])
    }
});

function createLaunchSpecification(instanceType: Value<string>) {
    var allocationId = Fn.GetAtt('ElasticIp', 'AllocationId');
    var publicSubnet1Id = Fn.ImportValue(Fn.Sub('${NetworkStackName}-PublicSubnet1', {}));
    var publicSubnet2Id = Fn.ImportValue(Fn.Sub('${NetworkStackName}-PublicSubnet2', {}));
    var securityGroupId = Fn.ImportValue(Fn.Sub('${NetworkStackName}-SecurityGroup', {}));
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
        SecurityGroups: [new EC2.SpotFleet.GroupIdentifier({ GroupId: securityGroupId })],
        SubnetId: Fn.Join(',', [publicSubnet1Id, publicSubnet2Id]),
        BlockDeviceMappings: [
            new EC2.SpotFleet.BlockDeviceMapping({
                DeviceName: '/dev/sdk',
                Ebs: new EC2.SpotFleet.EbsBlockDevice({
                    VolumeSize: 40,
                    VolumeType: 'gp2',
                    DeleteOnTermination: true,
                    SnapshotId: Fn.Ref('CacheSnapshotId')
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
