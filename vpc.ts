import cloudform, { Fn, Refs, EC2, StringParameter, ResourceTag, Route53 } from 'cloudform';

const createPMSStackLambdaFunction = `
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

`;

export default cloudform({
    Description: 'AWS Cloudformation template for personal media center on AWS using EC2 Spot, this template provisions only VPC and network related components',
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
        RegionMap : {
            "ap-south-1": { "S3hostedzoneID" : "Z11RGJOFQNVJUP", "websiteendpoint" : "s3-website.ap-south-1.amazonaws.com" },
            "us-east-1" : { "S3hostedzoneID" : "Z3AQBSTGFYJSTF", "websiteendpoint" : "s3-website-us-east-1.amazonaws.com" },
            "us-west-1" : { "S3hostedzoneID" : "Z2F56UZL2M1ACD", "websiteendpoint" : "s3-website-us-west-1.amazonaws.com" },
            "us-west-2" : { "S3hostedzoneID" : "Z3BJ6K6RIION7M", "websiteendpoint" : "s3-website-us-west-2.amazonaws.com" },            
            "eu-west-1" : { "S3hostedzoneID" : "Z1BKCTXD74EZPE", "websiteendpoint" : "s3-website-eu-west-1.amazonaws.com" },
            "ap-southeast-1" : { "S3hostedzoneID" : "Z3O0J2DXBE1FTB", "websiteendpoint" : "s3-website-ap-southeast-1.amazonaws.com" },
            "ap-southeast-2" : { "S3hostedzoneID" : "Z1WCIGYICN2BYD", "websiteendpoint" : "s3-website-ap-southeast-2.amazonaws.com" },
            "ap-northeast-1" : { "S3hostedzoneID" : "Z2M4EHUR26P7ZW", "websiteendpoint" : "s3-website-ap-northeast-1.amazonaws.com" },
            "sa-east-1" : { "S3hostedzoneID" : "Z31GFT0UA1I2HV", "websiteendpoint" : "s3-website-sa-east-1.amazonaws.com" }
        }
    },
    Parameters: {
        SourceCidr: new StringParameter({
            Description: 'Optional - CIDR/IP range for instance ssh access - defaults to 0.0.0.0/0',
            Default: '0.0.0.0/0'
        }),
        DomainName: new StringParameter({
            Description: 'Enter your custom domain name',
            Default: 'ibhi.tk'
        }),
        PMSApiGateway: new StringParameter({
            Description: 'PMS API Gateway ARN',
            Default: 'arn:aws:execute-api:ap-south-1:782677160809:bq6doqcg65/*/*/*'
        })
    },
    Outputs: {
        VPC: {
            Description: 'PMS VPC Id',
            Value: Fn.Ref('VPC'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-VPC', {})
            }
        },
        PublicSubnet1: {
            Description: 'Public Subnet 1 Id',
            Value: Fn.Ref('PublicSubnet1'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-PublicSubnet1', {})
            }
        },
        PublicSubnet2: {
            Description: 'Public Subnet 2 Id',
            Value: Fn.Ref('PublicSubnet2'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-PublicSubnet2', {})
            }
        },
        HostedZone: {
            Description: '',
            Value: Fn.Ref('HostedZone'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-HostedZone', {})
            }
        },
        SecurityGroup: {
            Description: '',
            Value: Fn.GetAtt('SecurityGroup', 'GroupId'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-SecurityGroup', {})
            }
        }
    },
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

        HostedZone: new Route53.HostedZone({
            Name: Fn.Ref('DomainName')
        }),

        // Pre-requisite: Create two buckets(one for root domain and another for www) with proper access control or bucket policy
        DomainRecordSetGroup: new Route53.RecordSetGroup({
            HostedZoneId: Fn.Ref('HostedZone'),
            RecordSets: [
                new Route53.RecordSetGroup.RecordSet({
                    Type: 'A',
                    Name: Fn.Ref('DomainName'),
                    AliasTarget: new Route53.RecordSet.AliasTarget({
                        HostedZoneId: Fn.FindInMap('RegionMap', Refs.Region, 'S3hostedzoneID'),
                        DNSName: Fn.FindInMap('RegionMap', Refs.Region, 'websiteendpoint')
                    })
                }),
                new Route53.RecordSetGroup.RecordSet({
                    Type: 'A',
                    Name: Fn.Join('.', ['www', Fn.Ref('DomainName')]),
                    AliasTarget: new Route53.RecordSet.AliasTarget({
                        HostedZoneId: Fn.FindInMap('RegionMap', Refs.Region, 'S3hostedzoneID'),
                        DNSName: Fn.FindInMap('RegionMap', Refs.Region, 'websiteendpoint')
                    })
                })
            ]
        }).dependsOn('HostedZone'),

        SecurityGroup: new EC2.SecurityGroup({
            GroupDescription: 'Personal Media Server Security Group',
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
                }),
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 443,
                    ToPort: 443,
                    IpProtocol: 'tcp'
                }),
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 32400,
                    ToPort: 32400,
                    IpProtocol: 'tcp'
                })
            ],
            VpcId: Fn.Ref('VPC')
        }),

        PMSLambdaExecutionRole: createPmsLambdaExecutionRole(),

        PMSCloudFormationStackCreationRole: createPMSCloudFormationStackCreationRole(),

        CreatePMSStackLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
                Handler: 'index.handler',
                FunctionName: 'CreatePMSStackLambdaFunction',
                Description: 'Lambda function to create PMS stack',
                Role: Fn.GetAtt('PMSLambdaExecutionRole', 'Arn'),
                Code: {
                    // S3Bucket: 'cf-templates-1g7z2nh3wiuu3-ap-south-1',
                    // S3Key: 'pms-create-stack-lambda.zip'
                    ZipFile: Fn.Sub(
                        createPMSStackLambdaFunction,
                        {
                            PMSCloudFormationStackCreationRoleArn: Fn.GetAtt('PMSCloudFormationStackCreationRole', 'Arn')
                        }
                    )
                },
                Runtime: 'nodejs6.10'
            },
            DependsOn: ['PMSLambdaExecutionRole', 'PMSCloudFormationStackCreationRole']
        },

        // PMSSNSTopic: {
        //     Type: 'AWS::SNS::Topic',
        //     Properties: {
        //         TopicName: 'PMS_STACK',
        //         Subscription: [
        //             {
        //                 Endpoint: 'arn:aws:lambda:ap-south-1:782677160809:function:CreatePMSStackLambdaFunction',
        //                 Protocol: 'lambda'
        //             }
        //         ]
        //     },
        //     // DependsOn: 'CreatePMSStackLambdaFunction'
        // },

        PMSLambdaResourcePolicy: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                FunctionName: Fn.Ref('CreatePMSStackLambdaFunction'),
                Principal: 'apigateway.amazonaws.com',
                Action: 'lambda:InvokeFunction',
                SourceArn: Fn.Ref('PMSApiGateway')
            },
            DependsOn: ['CreatePMSStackLambdaFunction']
        }
    }
});

function createPmsLambdaExecutionRole() {
    return {
        Type: 'AWS::IAM::Role',
        Properties: {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['lambda.amazonaws.com']
                        },
                        Action: ['sts:AssumeRole']
                    }
                ],
                Version: '2012-10-17'
            },
            Path: '/',
            Policies: [
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams'
                            ],
                            Resource: ['arn:aws:logs:*:*:*']
                        }]
                    },
                    PolicyName: 'PMSLambdaCloudWatchLogsPolicy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: [
                                    'cloudformation:CreateStack',
                                    'cloudformation:DescribeStacks',
                                    'cloudformation:DescribeStackEvents',
                                    'cloudformation:DescribeStackResources',
                                    'cloudformation:GetTemplate',
                                    'cloudformation:ValidateTemplate'
                                ],
                                Resource: '*'
                            },
                            {
                                Effect: 'Allow',
                                Action: [
                                    'cloudformation:DeleteStack',
                                    'cloudformation:UpdateStack'
                                ],
                                Resource: 'arn:aws:cloudformation:ap-south-1:782677160809:stack/pms/*'
                            }
                        ]
                    },
                    PolicyName: 'PMSLambdaCloudFormationPolicy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: ['s3:ListBucket'],
                                Resource: ['arn:aws:s3:::cf-templates-1g7z2nh3wiuu3-ap-south-1']
                            },
                            {
                                Effect: 'Allow',
                                Action: [
                                    's3:GetObject'
                                ],
                                Resource: ['arn:aws:s3:::cf-templates-1g7z2nh3wiuu3-ap-south-1/*']
                            }
                        ]
                    },
                    PolicyName: 'PMSLambdaS3BucketPolicy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: [
                                    'iam:GetRole',
                                    'iam:PassRole'
                                ],
                                Resource: Fn.GetAtt('PMSCloudFormationStackCreationRole', 'Arn')
                            }
                        ]
                    },
                    PolicyName: 'PMSLambdaIAMCFNRoleReadOnly'
                }
            ]
        }
    }
}

function createPMSCloudFormationStackCreationRole() {
    return {
        Type: 'AWS::IAM::Role',
        Properties: {
            AssumeRolePolicyDocument: {
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: ['cloudformation.amazonaws.com']
                    },
                    Action: ['sts:AssumeRole']
                }],
                Version: '2012-10-17'
            },
            Path: '/',
            Policies: [
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:DeleteLogGroup',
                                'logs:PutRetentionPolicy'
                            ],
                            Resource: ['arn:aws:logs:*:*:*']
                        }]
                    },
                    PolicyName: 'PMSCloudformationCloudWatchLogsPolicy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Action: [
                                'ec2:*'
                            ],
                            Effect: 'Allow',
                            Resource: '*'
                        }]
                    },
                    PolicyName: 'PMSCloudFormationEC2Policy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: [
                                    // 'route53:GetHostedZone',
                                    // 'route53:ListHostedZones',
                                    // 'route53:ChangeResourceRecordSets',
                                    // 'route53:GetChangeRequest',
                                    // 'route53:ListResourceRecordSets'
                                    'route53:*'
                                ],
                                Resource: '*'
                            }
                        ]
                    },
                    PolicyName: 'PMSCloudFormationRoute53Policy'
                },
                {
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: [
                                    'iam:CreateRole',
                                    'iam:DeleteRole',
                                    'iam:DeleteRolePolicy',
                                    'iam:DetachRolePolicy',
                                    'iam:GetRole',
                                    'iam:PassRole',
                                    'iam:PutRolePolicy',
                                    'iam:AttachRolePolicy',
                                    'iam:CreateInstanceProfile',
                                    'iam:DeleteInstanceProfile',
                                    'iam:AddRoleToInstanceProfile',
                                    'iam:RemoveRoleFromInstanceProfile',
                                    'iam:GetInstanceProfile'
                                ],
                                Resource: '*'
                            }
                        ]
                    },
                    PolicyName: 'PMSCloudFormationIAMPolicy'
                }
            ]
        }
    }
}