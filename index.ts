import cloudform, { Fn, Refs, EC2, StringParameter, ResourceTag, NumberParameter, IAM, Value } from "cloudform";

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
        })
    },
    Outputs: { },
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
        }).dependsOn('VPC'),
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
                    FromPort: 32400,
                    ToPort: 32400,
                    IpProtocol: 'tcp'
                })
            ],
            VpcId: Fn.Ref('VPC')
        }).dependsOn('VPC'),

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
        
        SpotFleet: new EC2.SpotFleet({
            SpotFleetRequestConfigData: new EC2.SpotFleet.SpotFleetRequestConfigData({
                AllocationStrategy: 'diversified',
                IamFleetRole: Fn.GetAtt('SpotFleetRole', 'Arn'),
                SpotPrice: Fn.Ref('SpotPrice'),
                TargetCapacity: Fn.Ref('SpotFleetTargetCapacity'),
                TerminateInstancesWithExpiration: true,
                LaunchSpecifications: [
                    createLaunchSpecification('c5.large'),
                    createLaunchSpecification('m5.large')
                ]
            })
        }).dependsOn('SpotFleetRole')
    }
});

function createLaunchSpecification(instanceType: Value<string>) {
    return new EC2.SpotFleet.SpotFleetLaunchSpecification({
        ImageId: Fn.FindInMap('Ubuntu', Refs.Region, 'AMI'),
        InstanceType: instanceType,
        KeyName: Fn.Ref('KeyName'),
        Monitoring: new EC2.SpotFleet.SpotFleetMonitoring({
            Enabled: true
        }),
        SecurityGroups: [ new EC2.SpotFleet.GroupIdentifier({ GroupId: Fn.Ref('SecurityGroup') }) ],
        SubnetId: Fn.Join(',', [Fn.Ref('PublicSubnet1'), Fn.Ref('PublicSubnet2')]),
        // UserData: ''
    })
}